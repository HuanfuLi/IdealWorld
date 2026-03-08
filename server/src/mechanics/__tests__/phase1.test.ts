/**
 * Phase 1 Integration Test Script
 *
 * Tests the Phase 1 deterministic engine in complete isolation from LLMs.
 * Feeds randomized and deterministic ActionCodes into the economy engine
 * and verifies:
 *  - Skill system: XP gain, level-up, decay
 *  - Inventory system: food spoilage, tool depreciation, starvation
 *  - Order book: order matching, price discovery, partial fills
 *  - Economy engine: full pipeline coordination
 *
 * Usage: npx tsx server/src/mechanics/__tests__/phase1.test.ts
 */
import type { ActionCode } from '../actionCodes.js';
import { processSkills, createSkillMatrix, getSkillMultiplier, getActionMultiplier, averageSkillLevel } from '../skillSystem.js';
import { processInventory, createInventory, getToolMultiplier, transferItems } from '../inventorySystem.js';
import { OrderBook } from '../orderBook.js';
import { runEconomyIteration, initializeAgentEconomy, type EconomyAgentInput } from '../economyEngine.js';
import { DEFAULT_SKILL_MATRIX, DEFAULT_INVENTORY } from '@idealworld/shared';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${message}`);
    }
}

function section(name: string): void {
    console.log(`\n═══ ${name} ═══`);
}

// ── Skill System Tests ──────────────────────────────────────────────────────

section('1A: Skill System');

// Test 1: Skill matrix initialization
const skills1 = createSkillMatrix();
assert(skills1.farming.level === 10, 'Default skill level is 10');
assert(skills1.farming.experience === 0, 'Default XP is 0');

const skills2 = createSkillMatrix('Farmer');
assert(skills2.farming.level === 25, 'Farmer gets boosted farming skill');
assert(skills2.crafting.level === 10, 'Non-affinity skill stays at 10');

// Test 2: Skill gain from WORK action
const skills3 = structuredClone(DEFAULT_SKILL_MATRIX);
processSkills(skills3, 'WORK');
assert(skills3.crafting.experience > 0, 'WORK grants crafting XP');
assert(skills3.mining.experience > 0, 'WORK grants secondary mining XP');

// Test 3: Skill decay for unused skills
const skills4 = createSkillMatrix('Farmer');
skills4.leadership.level = 50;
processSkills(skills4, 'WORK'); // Exercises crafting+mining, not leadership
assert(skills4.leadership.level < 50, 'Unused leadership skill decays');

// Test 4: Skill multiplier range
assert(getSkillMultiplier(0) === 0.5, 'Level 0 gives 0.5x multiplier');
assert(getSkillMultiplier(100) === 2.5, 'Level 100 gives 2.5x multiplier');
assert(getSkillMultiplier(50) === 1.5, 'Level 50 gives 1.5x multiplier');

// Test 5: Action multiplier with skills
const skills5 = structuredClone(DEFAULT_SKILL_MATRIX);
skills5.crafting.level = 80;
const mult = getActionMultiplier(skills5, 'WORK');
assert(mult > 1.0, 'High crafting skill boosts WORK multiplier');

// Test 6: Average skill level
const avgLevel = averageSkillLevel(skills5);
assert(avgLevel > 0, 'Average skill level is positive');

// ── Inventory System Tests ──────────────────────────────────────────────────

section('1B: Inventory System');

// Test 7: Inventory initialization
const inv1 = createInventory();
assert(inv1.food.quantity === 10, 'Default food quantity is 10');
assert(inv1.tools.quantity === 1, 'Default tools quantity is 1');

const inv2 = createInventory('Farmer');
assert(inv2.food.quantity === 15, 'Farmer gets more food');

// Test 8: Food consumption
const inv3 = structuredClone(DEFAULT_INVENTORY);
const result1 = processInventory(inv3, 'WORK');
assert(inv3.food.quantity < 10, 'Food consumed during iteration');
assert(!result1.isStarving, 'Not starving with food');

// Test 9: Starvation
const inv4 = structuredClone(DEFAULT_INVENTORY);
inv4.food.quantity = 0;
const result2 = processInventory(inv4, 'WORK');
assert(result2.isStarving, 'Starving when no food');
assert(result2.healthDelta < 0, 'Starvation causes health loss');
assert(result2.cortisolDelta > 0, 'Starvation increases cortisol');

// Test 10: Tool depreciation
const inv5 = structuredClone(DEFAULT_INVENTORY);
inv5.tools.quality = 60; // Start with reasonable quality
const startToolQuality = inv5.tools.quality;
processInventory(inv5, 'WORK');
assert(inv5.tools.quality < startToolQuality, 'Tool quality degrades with use');

// Test 11: PRODUCE generates food
const inv6 = structuredClone(DEFAULT_INVENTORY);
const startFood = inv6.food.quantity;
processInventory(inv6, 'PRODUCE', 1.5);
// Account for food consumed during iteration
assert(inv6.food.quantity >= startFood - 2, 'PRODUCE generates food from raw materials');
assert(inv6.raw_materials.quantity < 5, 'PRODUCE consumes raw materials');

// Test 12: Tool multiplier
const inv7 = structuredClone(DEFAULT_INVENTORY);
assert(getToolMultiplier(inv7) > 1.0, 'Having tools provides productivity bonus');

const inv8 = structuredClone(DEFAULT_INVENTORY);
inv8.tools.quantity = 0;
assert(getToolMultiplier(inv8) === 1.0, 'No tools means 1.0x multiplier');

// Test 13: Item transfer
const from = structuredClone(DEFAULT_INVENTORY);
const to = structuredClone(DEFAULT_INVENTORY);
to.food.quantity = 0;
const transferred = transferItems(from, to, 'food', 5);
assert(transferred, 'Transfer succeeds with sufficient stock');
assert(from.food.quantity === 5, 'Seller inventory decreases');
assert(to.food.quantity === 5, 'Buyer inventory increases');

// ── Order Book Tests ────────────────────────────────────────────────────────

section('1C: Order Book');

// Test 14: Order submission
const book1 = new OrderBook();
const order1 = book1.submitOrder({
    sessionId: 'test',
    agentId: 'buyer1',
    side: 'buy',
    itemType: 'food',
    price: 10,
    quantity: 5,
    iterationPlaced: 1,
});
assert(order1.id !== '', 'Order gets assigned an ID');
assert(!order1.filled, 'New order is unfilled');

// Test 15: Order matching
const book2 = new OrderBook();
book2.submitOrder({
    sessionId: 'test', agentId: 'buyer1', side: 'buy',
    itemType: 'food', price: 10, quantity: 5, iterationPlaced: 1,
});
book2.submitOrder({
    sessionId: 'test', agentId: 'seller1', side: 'sell',
    itemType: 'food', price: 8, quantity: 5, iterationPlaced: 1,
});

const matches = book2.matchOrders();
assert(matches.length === 1, 'One trade matched');
assert(matches[0].quantity === 5, 'Full quantity matched');
assert(matches[0].executionPrice === 9, 'Execution price is midpoint (9)');

// Test 16: No match when buy price < sell price
const book3 = new OrderBook();
book3.submitOrder({
    sessionId: 'test', agentId: 'buyer1', side: 'buy',
    itemType: 'food', price: 5, quantity: 3, iterationPlaced: 1,
});
book3.submitOrder({
    sessionId: 'test', agentId: 'seller1', side: 'sell',
    itemType: 'food', price: 10, quantity: 3, iterationPlaced: 1,
});

const noMatches = book3.matchOrders();
assert(noMatches.length === 0, 'No trade when buy price < sell price');

// Test 17: Partial fills
const book4 = new OrderBook();
book4.submitOrder({
    sessionId: 'test', agentId: 'buyer1', side: 'buy',
    itemType: 'food', price: 10, quantity: 10, iterationPlaced: 1,
});
book4.submitOrder({
    sessionId: 'test', agentId: 'seller1', side: 'sell',
    itemType: 'food', price: 8, quantity: 3, iterationPlaced: 1,
});

const partialMatches = book4.matchOrders();
assert(partialMatches.length === 1, 'One partial trade matched');
assert(partialMatches[0].quantity === 3, 'Only 3 units matched (limited by sell)');

// Test 18: Price priority (highest buyer matched first)
const book5 = new OrderBook();
book5.submitOrder({
    sessionId: 'test', agentId: 'buyer1', side: 'buy',
    itemType: 'food', price: 12, quantity: 3, iterationPlaced: 1,
});
book5.submitOrder({
    sessionId: 'test', agentId: 'buyer2', side: 'buy',
    itemType: 'food', price: 15, quantity: 3, iterationPlaced: 1,
});
book5.submitOrder({
    sessionId: 'test', agentId: 'seller1', side: 'sell',
    itemType: 'food', price: 10, quantity: 3, iterationPlaced: 1,
});

const priorityMatches = book5.matchOrders();
assert(priorityMatches.length === 1, 'One trade matched');
assert(priorityMatches[0].buyerId === 'buyer2', 'Higher bidder gets matched first');

// Test 19: Self-trade prevention
const book6 = new OrderBook();
book6.submitOrder({
    sessionId: 'test', agentId: 'agent1', side: 'buy',
    itemType: 'food', price: 10, quantity: 5, iterationPlaced: 1,
});
book6.submitOrder({
    sessionId: 'test', agentId: 'agent1', side: 'sell',
    itemType: 'food', price: 8, quantity: 5, iterationPlaced: 1,
});

const selfMatches = book6.matchOrders();
assert(selfMatches.length === 0, 'Self-trades are prevented');

// Test 20: Price indices
const book7 = new OrderBook();
book7.submitOrder({
    sessionId: 'test', agentId: 'buyer1', side: 'buy',
    itemType: 'food', price: 10, quantity: 5, iterationPlaced: 1,
});
book7.submitOrder({
    sessionId: 'test', agentId: 'seller1', side: 'sell',
    itemType: 'food', price: 8, quantity: 5, iterationPlaced: 1,
});
book7.matchOrders();
const indices = book7.computePriceIndices();
const foodIndex = indices.find(i => i.itemType === 'food');
assert(foodIndex !== undefined, 'Food price index exists');
assert(foodIndex!.lastPrice === 9, 'Last price is execution price');
assert(foodIndex!.volume === 5, 'Volume is 5');

// ── Economy Engine Tests ────────────────────────────────────────────────────

section('Economy Engine (Full Pipeline)');

// Test 21: Full pipeline with multiple agents
const agents: EconomyAgentInput[] = [
    {
        agentId: 'agent-1', agentName: 'Alice', role: 'Farmer',
        actionCode: 'PRODUCE', wealth: 50,
        skills: createSkillMatrix('Farmer'),
        inventory: createInventory('Farmer'),
    },
    {
        agentId: 'agent-2', agentName: 'Bob', role: 'Merchant',
        actionCode: 'WORK', wealth: 60,
        skills: createSkillMatrix('Merchant'),
        inventory: createInventory('Merchant'),
    },
    {
        agentId: 'agent-3', agentName: 'Charlie', role: 'Worker',
        actionCode: 'REST', wealth: 30,
        skills: createSkillMatrix('Worker'),
        inventory: createInventory(),
    },
];

const result = runEconomyIteration('test-session', 1, agents);

assert(result.agentOutputs.size === 3, 'All 3 agents have outputs');

const aliceOutput = result.agentOutputs.get('agent-1');
assert(aliceOutput !== undefined, 'Alice has output');
assert(aliceOutput!.skills.farming.experience > 0, 'Alice gained farming XP from PRODUCE');

const bobOutput = result.agentOutputs.get('agent-2');
assert(bobOutput !== undefined, 'Bob has output');
assert(bobOutput!.skills.crafting.experience > 0, 'Bob gained crafting XP from WORK');

assert(result.snapshot.iteration === 1, 'Snapshot has correct iteration');
assert(result.snapshot.summary.totalFood >= 0, 'Total food is tracked');

// Test 22: Starvation pipeline
const starvingAgents: EconomyAgentInput[] = [
    {
        agentId: 'starving-1', agentName: 'Dave', role: 'Worker',
        actionCode: 'WORK', wealth: 10,
        skills: createSkillMatrix(),
        inventory: {
            ...structuredClone(DEFAULT_INVENTORY),
            food: { type: 'food', quantity: 0, quality: 100 },
        },
    },
];

const starvingResult = runEconomyIteration('test-starve', 1, starvingAgents);
const daveOutput = starvingResult.agentOutputs.get('starving-1');
assert(daveOutput!.isStarving, 'Dave is flagged as starving');
assert(daveOutput!.healthDelta < 0, 'Starvation causes health loss');
assert(daveOutput!.events.some(e => e.includes('Starving')), 'Starvation event logged');

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
    console.error('\n❌ Some tests FAILED!');
    process.exit(1);
} else {
    console.log('\n✅ All Phase 1 tests PASSED!');
}
