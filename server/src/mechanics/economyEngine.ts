/**
 * Economy Engine — Phase 1 Orchestrator
 *
 * Coordinates all Phase 1 subsystems (skills, inventory, order book)
 * into a single per-iteration pipeline. Accepts standard ActionCodes
 * and produces deterministic economic outcomes.
 *
 * Pipeline per iteration:
 *   1. Process skill gains/decay for each agent's action
 *   2. Process inventory (spoilage, consumption, production)
 *   3. Submit market orders to the order book
 *   4. Match orders and resolve trades
 *   5. Handle employment contracts (SET_WAGE)
 *   6. Return economic deltas for the physics engine
 *
 * This module is fully deterministic and LLM-independent.
 */
import type {
    SkillMatrix,
    Inventory,
    ItemType,
    MarketState,
    EmploymentContract,
    EconomySnapshot,
} from '@idealworld/shared';
import type { ActionCode } from './actionCodes.js';
import { processSkills, getActionMultiplier, averageSkillLevel, createSkillMatrix } from './skillSystem.js';
import { processInventory, getToolMultiplier, createInventory, type InventoryProcessResult } from './inventorySystem.js';
import { getOrderBook, clearOrderBook, OrderBook } from './orderBook.js';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Input for processing one agent's economy for one iteration.
 */
export interface EconomyAgentInput {
    agentId: string;
    agentName: string;
    role: string;
    actionCode: ActionCode;
    /** Current wealth (for order book validation). */
    wealth: number;
    /** Agent's skill matrix (will be mutated). */
    skills: SkillMatrix;
    /** Agent's inventory (will be mutated). */
    inventory: Inventory;
    /** Optional: order details for POST_BUY_ORDER / POST_SELL_ORDER. */
    orderDetails?: {
        itemType: ItemType;
        price: number;
        quantity: number;
    };
    /** Optional: wage for SET_WAGE action. */
    wageOffer?: number;
    /** Optional: target agent for SET_WAGE (employee). */
    wageTarget?: string;
}

/**
 * Output from processing one agent's economy for one iteration.
 */
export interface EconomyAgentOutput {
    agentId: string;
    /** Updated skill matrix. */
    skills: SkillMatrix;
    /** Updated inventory. */
    inventory: Inventory;
    /** Wealth delta from economic activity (trades, wages). */
    wealthDelta: number;
    /** Health delta from inventory (starvation, nourishment). */
    healthDelta: number;
    /** Cortisol delta from inventory (food scarcity). */
    cortisolDelta: number;
    /** Happiness delta from inventory (food, luxuries). */
    happinessDelta: number;
    /** Effective skill multiplier used for this action. */
    skillMultiplier: number;
    /** Effective tool multiplier used for this action. */
    toolMultiplier: number;
    /** Whether the agent is starving. */
    isStarving: boolean;
    /** Game events (tools broken, spoiled items, etc.). */
    events: string[];
}

/**
 * Full result of running the economy engine for one iteration.
 */
export interface EconomyIterationResult {
    /** Per-agent economic outcomes. */
    agentOutputs: Map<string, EconomyAgentOutput>;
    /** Market state after order book clearing. */
    marketState: MarketState;
    /** Active employment contracts. */
    contracts: EmploymentContract[];
    /** Economy snapshot for statistics. */
    snapshot: EconomySnapshot;
}

// ── Active Contracts Registry ────────────────────────────────────────────────

const sessionContracts = new Map<string, EmploymentContract[]>();

function getContracts(sessionId: string): EmploymentContract[] {
    if (!sessionContracts.has(sessionId)) {
        sessionContracts.set(sessionId, []);
    }
    return sessionContracts.get(sessionId)!;
}

// ── Main Engine ──────────────────────────────────────────────────────────────

/**
 * Run the economy engine for one iteration.
 *
 * @param sessionId           Session ID.
 * @param iterationNumber     Current iteration number.
 * @param agentInputs         Array of agent inputs for this iteration.
 * @returns                   Full iteration economic results.
 */
export function runEconomyIteration(
    sessionId: string,
    iterationNumber: number,
    agentInputs: EconomyAgentInput[],
): EconomyIterationResult {
    const orderBook = getOrderBook(sessionId);
    const contracts = getContracts(sessionId);
    const agentOutputs = new Map<string, EconomyAgentOutput>();

    // ── Phase A: Process individual agent economy ─────────────────────────
    for (const input of agentInputs) {
        const output = processAgentEconomy(input, orderBook, sessionId, iterationNumber, contracts);
        agentOutputs.set(input.agentId, output);
    }

    // ── Phase B: Match orders in the order book ────────────────────────────
    const trades = orderBook.matchOrders();

    // Apply trade results to agent outputs
    for (const trade of trades) {
        const buyerOutput = agentOutputs.get(trade.buyerId);
        const sellerOutput = agentOutputs.get(trade.sellerId);

        if (buyerOutput) {
            // Buyer pays wealth, receives items
            buyerOutput.wealthDelta -= trade.executionPrice * trade.quantity;
            buyerOutput.inventory[trade.itemType].quantity += trade.quantity;
            buyerOutput.events.push(
                `Bought ${trade.quantity} ${trade.itemType} at $${trade.executionPrice}/unit`
            );
        }

        if (sellerOutput) {
            // Seller receives wealth, items already deducted when order was placed
            sellerOutput.wealthDelta += trade.executionPrice * trade.quantity;
            sellerOutput.events.push(
                `Sold ${trade.quantity} ${trade.itemType} at $${trade.executionPrice}/unit`
            );
        }
    }

    // ── Phase C: Process employment contracts ──────────────────────────────
    for (const contract of contracts) {
        const employerOutput = agentOutputs.get(contract.employerId);
        const employeeOutput = agentOutputs.get(contract.employeeId);

        if (employerOutput && employeeOutput) {
            employerOutput.wealthDelta -= contract.wage;
            employeeOutput.wealthDelta += contract.wage;
            employeeOutput.events.push(
                `Received wage of $${contract.wage} from employer`
            );
            employerOutput.events.push(
                `Paid wage of $${contract.wage} to employee`
            );
        }
    }

    // ── Phase D: Build market state and snapshot ───────────────────────────
    const marketState = orderBook.getMarketState();

    // Calculate summary stats
    let totalWealth = 0;
    let totalFood = 0;
    let totalTools = 0;
    let totalSkill = 0;

    for (const input of agentInputs) {
        const output = agentOutputs.get(input.agentId)!;
        totalWealth += input.wealth + output.wealthDelta;
        totalFood += output.inventory.food.quantity;
        totalTools += output.inventory.tools.quantity;
        totalSkill += averageSkillLevel(output.skills);
    }

    const snapshot: EconomySnapshot = {
        iteration: iterationNumber,
        market: marketState,
        contracts: [...contracts],
        summary: {
            totalWealth,
            totalFood,
            totalTools,
            avgSkillLevel: agentInputs.length > 0
                ? Math.round((totalSkill / agentInputs.length) * 100) / 100
                : 0,
            activeContracts: contracts.length,
        },
    };

    // Clean up expired orders at the end
    orderBook.reset();

    return {
        agentOutputs,
        marketState,
        contracts: [...contracts],
        snapshot,
    };
}

/**
 * Process economy for a single agent.
 */
function processAgentEconomy(
    input: EconomyAgentInput,
    orderBook: OrderBook,
    sessionId: string,
    iterationNumber: number,
    contracts: EmploymentContract[],
): EconomyAgentOutput {
    const events: string[] = [];

    // 1. Process skills
    const updatedSkills = processSkills(input.skills, input.actionCode);
    const skillMultiplier = getActionMultiplier(updatedSkills, input.actionCode);

    // 2. Process inventory
    const toolMultiplier = getToolMultiplier(input.inventory);
    const invResult: InventoryProcessResult = processInventory(
        input.inventory,
        input.actionCode,
        skillMultiplier * toolMultiplier,
    );

    // Collect inventory events
    if (invResult.isStarving) events.push('Starving — no food available');
    if (invResult.toolsBroken) events.push('Tools broke from wear');
    for (const spoiled of invResult.spoiledItems) {
        events.push(`${spoiled.quantity} ${spoiled.type} spoiled`);
    }

    // 3. Handle market orders
    let wealthDelta = 0;

    if (input.actionCode === 'POST_BUY_ORDER' && input.orderDetails) {
        const totalCost = input.orderDetails.price * input.orderDetails.quantity;
        if (input.wealth >= totalCost) {
            orderBook.submitOrder({
                sessionId,
                agentId: input.agentId,
                side: 'buy',
                itemType: input.orderDetails.itemType,
                price: input.orderDetails.price,
                quantity: input.orderDetails.quantity,
                iterationPlaced: iterationNumber,
            });
            events.push(
                `Posted buy order: ${input.orderDetails.quantity} ${input.orderDetails.itemType} at $${input.orderDetails.price}/unit`
            );
        } else {
            events.push('Insufficient wealth to place buy order');
        }
    }

    if (input.actionCode === 'POST_SELL_ORDER' && input.orderDetails) {
        const available = input.inventory[input.orderDetails.itemType].quantity;
        if (available >= input.orderDetails.quantity) {
            // Reserve items immediately
            input.inventory[input.orderDetails.itemType].quantity -= input.orderDetails.quantity;
            orderBook.submitOrder({
                sessionId,
                agentId: input.agentId,
                side: 'sell',
                itemType: input.orderDetails.itemType,
                price: input.orderDetails.price,
                quantity: input.orderDetails.quantity,
                iterationPlaced: iterationNumber,
            });
            events.push(
                `Posted sell order: ${input.orderDetails.quantity} ${input.orderDetails.itemType} at $${input.orderDetails.price}/unit`
            );
        } else {
            events.push(`Insufficient ${input.orderDetails.itemType} to sell`);
        }
    }

    // 4. Handle SET_WAGE (employment)
    if (input.actionCode === 'SET_WAGE' && input.wageOffer != null && input.wageTarget) {
        // Remove existing contract if any
        const existingIdx = contracts.findIndex(
            c => c.employerId === input.agentId && c.employeeId === input.wageTarget
        );
        if (existingIdx >= 0) contracts.splice(existingIdx, 1);

        contracts.push({
            employerId: input.agentId,
            employeeId: input.wageTarget,
            wage: input.wageOffer,
            startedAt: iterationNumber,
        });
        events.push(`Set wage of $${input.wageOffer} for employee`);
    }

    return {
        agentId: input.agentId,
        skills: updatedSkills,
        inventory: invResult.inventory,
        wealthDelta,
        healthDelta: invResult.healthDelta,
        cortisolDelta: invResult.cortisolDelta,
        happinessDelta: invResult.happinessDelta,
        skillMultiplier,
        toolMultiplier,
        isStarving: invResult.isStarving,
        events,
    };
}

/**
 * Initialize economy data for a new agent.
 */
export function initializeAgentEconomy(role: string): {
    skills: SkillMatrix;
    inventory: Inventory;
} {
    return {
        skills: createSkillMatrix(role),
        inventory: createInventory(role),
    };
}

/**
 * Clean up all economy state for a session.
 */
export function cleanupSessionEconomy(sessionId: string): void {
    clearOrderBook(sessionId);
    sessionContracts.delete(sessionId);
}
