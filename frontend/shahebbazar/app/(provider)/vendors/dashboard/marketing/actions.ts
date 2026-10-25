"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend, type AuthenticatedSendResult } from "@/lib/auth-server";
import type { CampaignContent, CampaignDetail, PostChannel } from "@/lib/types";

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
    /** One of the business's events, for an event campaign (KAN-298); null for one typed in. */
    event_id: number | null;
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

/** Marks the campaign as posted on Facebook or WhatsApp, with an optional link to the post. */
export async function markPosted(
    vendorId: number,
    campaignId: number,
    channel: PostChannel,
    url: string
): Promise<AuthenticatedSendResult<CampaignDetail>> {
    const result = await authenticatedApiSend<CampaignDetail>("PUT", `/vendors/${vendorId}/marketing/campaigns/${campaignId}/posts/${channel}`, { url });
    if (result.ok) refresh();
    return result;
}

export async function unmarkPosted(vendorId: number, campaignId: number, channel: PostChannel): Promise<AuthenticatedSendResult<CampaignDetail>> {
    const result = await authenticatedApiSend<CampaignDetail>("DELETE", `/vendors/${vendorId}/marketing/campaigns/${campaignId}/posts/${channel}`);
    if (result.ok) refresh();
    return result;
}

export async function deleteCampaign(vendorId: number, campaignId: number): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("DELETE", `/vendors/${vendorId}/marketing/campaigns/${campaignId}`);
    if (result.ok) refresh();
    return result;
}
