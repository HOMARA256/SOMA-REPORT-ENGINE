import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
const mapDelegation = (row) => ({ id: row.id, delegateFromUserId: row.delegate_from_user_id, delegateFromRole: row.delegate_from_role, delegateToUserId: row.delegate_to_user_id, delegateToRole: row.delegate_to_role, approvalTypes: row.approval_types ?? [], maximumAmountMinor: row.maximum_amount_minor, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason, isActive: row.is_active, revokedAt: row.revoked_at });
const mapRequest = (row) => ({ id: row.id, requestType: row.request_type, title: row.title, requesterId: row.requested_by, assignedApproverId: row.assigned_approver_id, primaryRole: row.primary_approver_role, fallbackRole: row.fallback_approver_role, originalRole: row.original_approver_role, delegatedAuthority: row.delegated_authority, status: row.status, priority: row.priority, reason: row.reason, createdAt: row.created_at, dueAt: row.due_at, relatedPath: row.related_record_path, decision: row.decision, decisionNotes: row.decision_notes });
export function useApprovalEngine() {
    const context = useSchoolContext();
    const schoolId = context.schoolId;
    const [currentUserId, setCurrentUserId] = useState("");
    const [members, setMembers] = useState([]);
    const [delegations, setDelegations] = useState([]);
    const [requests, setRequests] = useState([]);
    const [policies, setPolicies] = useState([]);
    const [reasons, setReasons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const reload = useCallback(async () => {
        const client = supabase;
        if (!client) {
            setError("Supabase is not configured.");
            setLoading(false);
            return;
        }
        if (context.loading)
            return;
        if (context.error) {
            setError(context.error);
            setLoading(false);
            return;
        }
        if (!schoolId) {
            setError("Active school context was not found.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        const { data: auth } = await client.auth.getUser();
        const authId = auth?.user?.id;
        if (!authId) {
            setError("Sign in is required.");
            setLoading(false);
            return;
        }
        const { data: user, error: userError } = await client.from("users").select("id").eq("auth_user_id", authId).eq("is_active", true).maybeSingle();
        if (userError || !user) {
            setError(userError?.message ?? "Active user identity was not found.");
            setLoading(false);
            return;
        }
        setCurrentUserId(user.id);
        const [memberResult, delegationResult, requestResult, policyResult, reasonResult] = await Promise.all([
            client.from("school_memberships").select("user_id,users(id,full_name,email),roles(code)").eq("school_id", schoolId).eq("status", "ACTIVE"),
            client.from("approval_delegations").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }),
            client.from("approval_requests").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }),
            client.from("approval_policies").select("request_type,primary_role,fallback_role,high_risk_mode,deadline_hours,maximum_amount_minor").or(`school_id.eq.${schoolId},school_id.is.null`).eq("is_active", true).order("request_type"),
            client.from("action_reason_catalogue").select("reason_code,reason_label,reason_description,action_type,requires_additional_note,is_system_suggested,display_order").eq("is_active", true).order("display_order"),
        ]);
        const firstError = memberResult.error ?? delegationResult.error ?? requestResult.error ?? policyResult.error ?? reasonResult.error;
        if (firstError)
            setError(firstError.message);
        setMembers((memberResult.data ?? []).map((row) => ({ userId: row.user_id, name: row.users?.full_name || row.users?.email || "Unnamed user", email: row.users?.email ?? "", role: row.roles?.code ?? "UNASSIGNED" })));
        setDelegations((delegationResult.data ?? []).map(mapDelegation));
        setRequests((requestResult.data ?? []).map(mapRequest));
        setPolicies((policyResult.data ?? []).map((row) => ({ requestType: row.request_type, primaryRole: row.primary_role, fallbackRole: row.fallback_role, highRiskMode: row.high_risk_mode, deadlineHours: row.deadline_hours, maximumAmountMinor: row.maximum_amount_minor })));
        setReasons((reasonResult.data ?? []).map((row) => ({ code: row.reason_code, label: row.reason_label, description: row.reason_description, actionType: row.action_type, requiresNote: row.requires_additional_note, suggested: row.is_system_suggested, displayOrder: row.display_order })));
        setLoading(false);
    }, [context.loading, context.error, schoolId]);
    useEffect(() => { void reload(); }, [reload]);
    async function createDelegation(input) {
        const client = supabase;
        if (!client || !schoolId)
            return "School approval context is unavailable.";
        const { error: rpcError } = await client.rpc("create_approval_delegation", { p_school_id: schoolId, p_delegate_from_user_id: input.fromUserId, p_delegate_to_user_id: input.toUserId, p_approval_types: input.approvalTypes, p_maximum_amount_minor: input.maximumAmountMinor, p_starts_at: input.startsAt, p_ends_at: input.endsAt, p_reason: input.reason });
        if (rpcError)
            return rpcError.message;
        await reload();
        return null;
    }
    async function revokeDelegation(id, reason) { const client = supabase; const { error: rpcError } = await client.rpc("revoke_approval_delegation", { p_delegation_id: id, p_reason: reason }); if (rpcError)
        return rpcError.message; await reload(); return null; }
    async function decideRequest(id, decision, reasonCode, note, detectedConditions = []) { const client = supabase; const { error: rpcError } = await client.rpc("decide_approval_request_v2", { p_request_id: id, p_decision: decision, p_reason_code: reasonCode, p_note: note, p_detected_conditions: detectedConditions }); if (rpcError)
        return rpcError.message; await reload(); return null; }
    async function submitRequest(input) {
        const client = supabase;
        if (!client || !schoolId)
            return "School approval context is unavailable.";
        const { error: rpcError } = await client.rpc("submit_approval_request", { p_school_id: schoolId, p_request_type: input.requestType, p_title: input.title, p_reason: input.reason, p_supporting_evidence: input.supportingEvidence ?? [], p_related_record_type: input.relatedRecordType, p_related_record_id: input.relatedRecordId, p_related_record_path: input.relatedPath, p_priority: input.priority ?? "NORMAL", p_amount_minor: null });
        if (rpcError)
            return rpcError.message;
        await reload();
        return null;
    }
    async function queueReportJob(input) {
        const client = supabase;
        if (!client || !schoolId)
            return "School report context is unavailable.";
        const { error: rpcError } = await client.rpc("queue_report_generation_job", { p_school_id: schoolId, p_academic_year_id: context.academicYearId || null, p_term_id: context.termId || null, p_class_id: null, p_stream_id: null, p_programme: input.programme, p_output_type: input.outputType, p_request_key: input.requestKey });
        return rpcError?.message ?? null;
    }
    return { schoolId, currentUserId, members, delegations, requests, policies, reasons, loading, error, reload, createDelegation, revokeDelegation, decideRequest, submitRequest, queueReportJob };
}
