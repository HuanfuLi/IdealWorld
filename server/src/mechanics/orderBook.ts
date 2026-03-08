/**
 * Component 1C: Global Order Book Matching Engine
 *
 * Replaces 1-on-1 bartering with a realistic market clearing mechanism.
 * All market interactions are abstracted into POST_BUY_ORDER and POST_SELL_ORDER
 * commands. At the end of each iteration, the system matches orders centrally
 * based on price/time priority, dynamically establishing supply-demand equilibrium.
 *
 * This module is fully deterministic and LLM-independent.
 */
import { v4 as uuidv4 } from 'uuid';
import type {
    ItemType,
    MarketOrder,
    TradeMatch,
    PriceIndex,
    MarketState,
} from '@idealworld/shared';
import { ITEM_TYPES } from '@idealworld/shared';

// ── Order Book Data Structure ────────────────────────────────────────────────

/**
 * In-memory order book for one session.
 * Buy orders sorted descending by price (highest first).
 * Sell orders sorted ascending by price (lowest first).
 */
export class OrderBook {
    private buyOrders: MarketOrder[] = [];
    private sellOrders: MarketOrder[] = [];
    private tradeHistory: TradeMatch[] = [];

    /**
     * Reset the order book for a new iteration while preserving unfilled orders.
     */
    reset(): void {
        this.tradeHistory = [];
        // Unfilled orders carry over (good-till-cancelled)
        this.buyOrders = this.buyOrders.filter(o => !o.filled);
        this.sellOrders = this.sellOrders.filter(o => !o.filled);
    }

    /**
     * Submit a new order to the book.
     */
    submitOrder(order: Omit<MarketOrder, 'id' | 'filled' | 'filledQuantity'>): MarketOrder {
        const fullOrder: MarketOrder = {
            ...order,
            id: uuidv4(),
            filled: false,
            filledQuantity: 0,
        };

        if (order.side === 'buy') {
            this.buyOrders.push(fullOrder);
            // Sort descending by price, then by iteration (FIFO within price)
            this.buyOrders.sort((a, b) => b.price - a.price || a.iterationPlaced - b.iterationPlaced);
        } else {
            this.sellOrders.push(fullOrder);
            // Sort ascending by price, then by iteration (FIFO within price)
            this.sellOrders.sort((a, b) => a.price - b.price || a.iterationPlaced - b.iterationPlaced);
        }

        return fullOrder;
    }

    /**
     * Run the matching engine: match buy and sell orders by price/time priority.
     * Returns all trades executed.
     */
    matchOrders(): TradeMatch[] {
        const matches: TradeMatch[] = [];

        // Process each item type independently
        for (const itemType of ITEM_TYPES) {
            const buys = this.buyOrders.filter(o => o.itemType === itemType && !o.filled);
            const sells = this.sellOrders.filter(o => o.itemType === itemType && !o.filled);

            let buyIdx = 0;
            let sellIdx = 0;

            while (buyIdx < buys.length && sellIdx < sells.length) {
                const buy = buys[buyIdx];
                const sell = sells[sellIdx];

                // Match condition: buy price >= sell price
                if (buy.price < sell.price) break; // No more matches possible

                // Don't match self-trades
                if (buy.agentId === sell.agentId) {
                    sellIdx++;
                    continue;
                }

                // Calculate match quantity
                const buyRemaining = buy.quantity - buy.filledQuantity;
                const sellRemaining = sell.quantity - sell.filledQuantity;
                const matchQty = Math.min(buyRemaining, sellRemaining);

                if (matchQty <= 0) {
                    if (buyRemaining <= 0) buyIdx++;
                    else sellIdx++;
                    continue;
                }

                // Execution price: midpoint of buy and sell prices
                const executionPrice = Math.round((buy.price + sell.price) / 2);

                const match: TradeMatch = {
                    buyOrderId: buy.id,
                    sellOrderId: sell.id,
                    buyerId: buy.agentId,
                    sellerId: sell.agentId,
                    itemType,
                    quantity: matchQty,
                    executionPrice,
                };

                matches.push(match);

                // Update fill quantities
                buy.filledQuantity += matchQty;
                sell.filledQuantity += matchQty;

                if (buy.filledQuantity >= buy.quantity) {
                    buy.filled = true;
                    buyIdx++;
                }
                if (sell.filledQuantity >= sell.quantity) {
                    sell.filled = true;
                    sellIdx++;
                }
            }
        }

        this.tradeHistory.push(...matches);
        return matches;
    }

    /**
     * Compute price indices for all item types based on current iteration's trades.
     */
    computePriceIndices(): PriceIndex[] {
        const indices: PriceIndex[] = [];

        for (const itemType of ITEM_TYPES) {
            const trades = this.tradeHistory.filter(t => t.itemType === itemType);
            const buys = this.buyOrders.filter(o => o.itemType === itemType);
            const sells = this.sellOrders.filter(o => o.itemType === itemType);

            if (trades.length === 0) {
                // No trades: use mid-market estimate from unfilled orders
                const bestBid = buys.length > 0 ? Math.max(...buys.map(o => o.price)) : 0;
                const bestAsk = sells.length > 0 ? Math.min(...sells.map(o => o.price)) : 0;

                indices.push({
                    itemType,
                    lastPrice: bestBid > 0 && bestAsk > 0 ? Math.round((bestBid + bestAsk) / 2) : 0,
                    vwap: 0,
                    volume: 0,
                    totalDemand: buys.reduce((s, o) => s + (o.quantity - o.filledQuantity), 0),
                    totalSupply: sells.reduce((s, o) => s + (o.quantity - o.filledQuantity), 0),
                });
                continue;
            }

            // VWAP: volume-weighted average price
            const totalVolume = trades.reduce((s, t) => s + t.quantity, 0);
            const vwap = totalVolume > 0
                ? Math.round(trades.reduce((s, t) => s + t.executionPrice * t.quantity, 0) / totalVolume)
                : 0;

            indices.push({
                itemType,
                lastPrice: trades[trades.length - 1].executionPrice,
                vwap,
                volume: totalVolume,
                totalDemand: buys.reduce((s, o) => s + Math.max(0, o.quantity - o.filledQuantity), 0),
                totalSupply: sells.reduce((s, o) => s + Math.max(0, o.quantity - o.filledQuantity), 0),
            });
        }

        return indices;
    }

    /**
     * Get the full market state after matching.
     */
    getMarketState(): MarketState {
        return {
            priceIndices: this.computePriceIndices(),
            trades: [...this.tradeHistory],
            openOrders: [
                ...this.buyOrders.filter(o => !o.filled),
                ...this.sellOrders.filter(o => !o.filled),
            ],
        };
    }

    /**
     * Remove all orders for a specific agent (e.g., when they die).
     */
    removeAgentOrders(agentId: string): void {
        this.buyOrders = this.buyOrders.filter(o => o.agentId !== agentId);
        this.sellOrders = this.sellOrders.filter(o => o.agentId !== agentId);
    }

    /**
     * Get the best current price for an item type (for agent decision-making).
     * Returns the midpoint of best bid and best ask, or 0 if no orders.
     */
    getBestPrice(itemType: ItemType): number {
        const buys = this.buyOrders.filter(o => o.itemType === itemType && !o.filled);
        const sells = this.sellOrders.filter(o => o.itemType === itemType && !o.filled);

        const bestBid = buys.length > 0 ? buys[0].price : 0;
        const bestAsk = sells.length > 0 ? sells[0].price : 0;

        if (bestBid > 0 && bestAsk > 0) return Math.round((bestBid + bestAsk) / 2);
        if (bestBid > 0) return bestBid;
        if (bestAsk > 0) return bestAsk;
        return 0;
    }

    /**
     * Get the total number of open (unfilled) orders.
     */
    get openOrderCount(): number {
        return this.buyOrders.filter(o => !o.filled).length
            + this.sellOrders.filter(o => !o.filled).length;
    }
}

// ── Session Order Book Registry ──────────────────────────────────────────────

/**
 * Global registry of order books, one per active session.
 */
const sessionOrderBooks = new Map<string, OrderBook>();

/**
 * Get or create the order book for a session.
 */
export function getOrderBook(sessionId: string): OrderBook {
    let book = sessionOrderBooks.get(sessionId);
    if (!book) {
        book = new OrderBook();
        sessionOrderBooks.set(sessionId, book);
    }
    return book;
}

/**
 * Clean up the order book for a session (e.g., when simulation ends).
 */
export function clearOrderBook(sessionId: string): void {
    sessionOrderBooks.delete(sessionId);
}
