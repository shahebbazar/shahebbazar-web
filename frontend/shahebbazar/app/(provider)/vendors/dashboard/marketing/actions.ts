"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend, type AuthenticatedSendResult } from "@/lib/auth-server";
import type { CampaignContent, CampaignDetail } from "@/lib/types";

// The API checks the signed-in owner or manager runs the business, and the pass allows it.

export type CampaignBriefInput = {
    title: string;
    goal: string;
    language: string;
    call_to_action: string;
    offer: string;
    starts_on: string;
    ends_on: string;
    listing_ids: number[];
    coupon_code: string;
};

const refresh = () => revalidatePath("/vendors/dashboard/marketing", "layout");

export async function createCampaign(vendorId: number, brief: CampaignBriefInput): Promise<AuthenticatedSendResult<CampaignDetail>> {
    const result = await authenticatedApiSend<CampaignDetail>("POST", `/vendors/${vendorId}/marketing/campaigns`, brief);
    if (result.ok) refresh();
    return result;
}

export async function saveCampaignContent(
    vendorId: number,
    campaignId: number,
    content: CampaignContent
): Promise<AuthenticatedSendResult<CampaignDetail>> {
    const result = await authenticatedApiSend<CampaignDetail>("PUT", `/vendors/${vendorId}/marketing/campaigns/${campaignId}/content`, content);
    if (result.ok) refresh();
    return result;
}

export async function approveCampaign(vendorId: number, campaignId: number, versionId: number): Promise<AuthenticatedSendResult<CampaignDetail>> {
    const result = await authenticatedApiSend<CampaignDetail>("POST", `/vendors/${vendorId}/marketing/campaigns/${campaignId}/approve`, {
        version_id: versionId,
    });
    if (result.ok) refresh();
    return result;
}

export async function sendCampaign(
    vendorId: number,
    campaignId: number
): Promise<AuthenticatedSendResult<{ sent: number; failed: number; campaign: CampaignDetail }>> {
    const result = await authenticatedApiSend<{ sent: number; failed: number; campaign: CampaignDetail }>(
        "POST",
        `/vendors/${vendorId}/marketing/campaigns/${campaignId}/send`
    );
    if (result.ok) refresh();
    return result;
}

export async function deleteCampaign(vendorId: number, campaignId: number): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("DELETE", `/vendors/${vendorId}/marketing/campaigns/${campaignId}`);
    if (result.ok) refresh();
    return result;
}
