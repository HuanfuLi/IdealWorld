import { eq, and } from 'drizzle-orm';
import { db } from '../index.js';
import { enterprises, jobOffers } from '../schema.js';
import type { Enterprise } from '../../mechanics/physicsEngine.js';

export interface JobOffer {
    id: string;
    sessionId: string;
    enterpriseId: string;
    ownerId: string;
    industry: string;
    wage: number;
    minSkillReq: number;
    isOpen: boolean;
    postedAt: number;
    applicantIds: string; // JSON array
}

// Map db row to Enterprise
function mapEnterprise(row: any): Enterprise {
    return {
        id: row.id,
        sessionId: row.sessionId,
        ownerId: row.ownerId,
        name: row.name,
        industry: row.industry,
        outputCommodity: row.outputCommodity,
        efficiencyMultiplier: row.efficiencyMultiplier,
        employeeIds: row.employeeIds,
        wagePer8Ticks: row.wagePer8Ticks,
        stockpile: row.stockpile,
        foundedAt: row.foundedAt,
        isActive: row.isActive,
    };
}

// Map db row to JobOffer
function mapJobOffer(row: any): JobOffer {
    return {
        id: row.id,
        sessionId: row.sessionId,
        enterpriseId: row.enterpriseId,
        ownerId: row.ownerId,
        industry: row.industry,
        wage: row.wage,
        minSkillReq: row.minSkillReq,
        isOpen: row.isOpen,
        postedAt: row.postedAt,
        applicantIds: row.applicantIds,
    };
}

export const enterpriseRepo = {
    async create(enterprise: Enterprise): Promise<void> {
        await db.insert(enterprises).values({
            id: enterprise.id,
            sessionId: enterprise.sessionId,
            ownerId: enterprise.ownerId,
            name: enterprise.name,
            industry: enterprise.industry,
            outputCommodity: enterprise.outputCommodity,
            efficiencyMultiplier: enterprise.efficiencyMultiplier,
            employeeIds: enterprise.employeeIds,
            wagePer8Ticks: enterprise.wagePer8Ticks,
            stockpile: enterprise.stockpile,
            foundedAt: enterprise.foundedAt,
            isActive: enterprise.isActive,
        });
    },

    async getById(id: string): Promise<Enterprise | null> {
        const [row] = await db.select().from(enterprises).where(eq(enterprises.id, id));
        if (!row) return null;
        return mapEnterprise(row);
    },

    async listBySession(sessionId: string): Promise<Enterprise[]> {
        const rows = await db.select().from(enterprises).where(eq(enterprises.sessionId, sessionId));
        return rows.map(mapEnterprise);
    },

    async addEmployee(enterpriseId: string, agentId: string): Promise<void> {
        const ent = await this.getById(enterpriseId);
        if (!ent) return;
        const currentEmployees: string[] = JSON.parse(ent.employeeIds || '[]');
        if (!currentEmployees.includes(agentId)) {
            currentEmployees.push(agentId);
            await db.update(enterprises)
                .set({ employeeIds: JSON.stringify(currentEmployees) })
                .where(eq(enterprises.id, enterpriseId));
        }
    },

    async removeEmployee(enterpriseId: string, agentId: string): Promise<void> {
        const ent = await this.getById(enterpriseId);
        if (!ent) return;
        let currentEmployees: string[] = JSON.parse(ent.employeeIds || '[]');
        if (currentEmployees.includes(agentId)) {
            currentEmployees = currentEmployees.filter(id => id !== agentId);
            await db.update(enterprises)
                .set({ employeeIds: JSON.stringify(currentEmployees) })
                .where(eq(enterprises.id, enterpriseId));
        }
    },

    async updateStockpile(enterpriseId: string, delta: number): Promise<void> {
        const ent = await this.getById(enterpriseId);
        if (!ent) return;
        const newStockpile = Math.max(0, ent.stockpile + delta);
        await db.update(enterprises)
            .set({ stockpile: newStockpile })
            .where(eq(enterprises.id, enterpriseId));
    },

    async listOpenJobOffers(sessionId: string): Promise<JobOffer[]> {
        const rows = await db.select()
            .from(jobOffers)
            .where(and(eq(jobOffers.sessionId, sessionId), eq(jobOffers.isOpen, true)));
        return rows.map(mapJobOffer);
    },

    async postJobOffer(offer: JobOffer): Promise<void> {
        await db.insert(jobOffers).values({
            id: offer.id,
            sessionId: offer.sessionId,
            enterpriseId: offer.enterpriseId,
            ownerId: offer.ownerId,
            industry: offer.industry,
            wage: offer.wage,
            minSkillReq: offer.minSkillReq,
            isOpen: offer.isOpen,
            postedAt: offer.postedAt,
            applicantIds: offer.applicantIds,
        });
    },

    async closeJobOffer(offerId: string): Promise<void> {
        await db.update(jobOffers)
            .set({ isOpen: false })
            .where(eq(jobOffers.id, offerId));
    }
};
