'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminAnalyticsResponseT,
  AdminPropertiesListQueryT,
  AdminPropertyDetailDTOT,
  AdminPropertyListResponseT,
  AdminRequestsListQueryT,
  AdminRequestsListResponseT,
  AdminUserDTOT,
  AdminUserListResponseT,
  AdminUsersListQueryT,
  AuditListQueryT,
  AuditListResponseT,
  BulkSuspendResultT,
  FeatureFlagDTOT,
  ReportDTOT,
  ReportListQueryT,
  ReportListResponseT,
  ReportResolveBodyT,
  VerificationDetailDTOT,
  VerificationQueueQueryT,
  VerificationQueueResponseT,
  SetPropertyStatusBodyT,
  SuspendBodyT,
} from '@rentuz/contracts';
import { api } from '@/lib/api';

/**
 * Phase 7 admin data hooks. Query keys are namespaced ['admin', …]; every
 * mutation invalidates the lists it can change (and the audit feed, since
 * every mutation writes a row).
 */
const qs = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
};

// ── analytics / requests ──

export function useAdminAnalytics(range: string) {
  return useQuery({
    queryKey: ['admin', 'analytics', range],
    queryFn: () => api.get<AdminAnalyticsResponseT>(`/admin/analytics${qs({ range })}`),
  });
}

export function useAdminRequests(query: AdminRequestsListQueryT) {
  return useQuery({
    queryKey: ['admin', 'requests', query],
    queryFn: () => api.get<AdminRequestsListResponseT>(`/admin/requests${qs(query)}`),
  });
}

// ── users ──

export function useAdminUsers(query: AdminUsersListQueryT) {
  return useQuery({
    queryKey: ['admin', 'users', query],
    queryFn: () => api.get<AdminUserListResponseT>(`/admin/users${qs(query)}`),
  });
}

export function useAdminUser(userId: string | null) {
  return useQuery({
    queryKey: ['admin', 'user', userId],
    enabled: !!userId,
    queryFn: () => api.get<AdminUserDTOT>(`/admin/users/${userId}`),
  });
}

export function useSetUserStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: SuspendBodyT }) =>
      api.patch<AdminUserDTOT>(`/admin/users/${userId}/status`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'users'] });
      void client.invalidateQueries({ queryKey: ['admin', 'user'] });
      void client.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

export function useBulkSuspend() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { userIds: string[]; reason: string }) =>
      api.post<BulkSuspendResultT>('/admin/users/bulk/suspend', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'users'] });
      void client.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

// ── properties ──

export function useAdminProperties(query: AdminPropertiesListQueryT) {
  return useQuery({
    queryKey: ['admin', 'properties', query],
    queryFn: () => api.get<AdminPropertyListResponseT>(`/admin/properties${qs(query)}`),
  });
}

export function useAdminProperty(propertyId: string | null) {
  return useQuery({
    queryKey: ['admin', 'property', propertyId],
    enabled: !!propertyId,
    queryFn: () => api.get<AdminPropertyDetailDTOT>(`/admin/properties/${propertyId}`),
  });
}

export function useSetPropertyStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, body }: { propertyId: string; body: SetPropertyStatusBodyT }) =>
      api.patch<{ id: string; status: string }>(`/admin/properties/${propertyId}/status`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'properties'] });
      void client.invalidateQueries({ queryKey: ['admin', 'property'] });
      void client.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

// ── verification ──

export function useVerificationQueue(query: VerificationQueueQueryT) {
  return useQuery({
    queryKey: ['admin', 'verification', query],
    queryFn: () => api.get<VerificationQueueResponseT>(`/admin/verification${qs(query)}`),
  });
}

export function useVerificationDetail(propertyId: string | null) {
  return useQuery({
    queryKey: ['admin', 'verification-detail', propertyId],
    enabled: !!propertyId,
    queryFn: () => api.get<VerificationDetailDTOT>(`/admin/verification/${propertyId}`),
  });
}

export function useClaimVerification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (propertyId: string) => api.post<{ id: string }>(`/admin/verification/${propertyId}/claim`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'verification'] });
      void client.invalidateQueries({ queryKey: ['admin', 'verification-detail'] });
    },
  });
}

export function useVerificationAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      propertyId,
      action,
      body,
    }: {
      propertyId: string;
      action: 'approve' | 'reject' | 'request-info';
      body?: { reason?: string; message?: string };
    }) => api.post<{ id: string; status: string }>(`/admin/verification/${propertyId}/${action}`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'verification'] });
      void client.invalidateQueries({ queryKey: ['admin', 'verification-detail'] });
      void client.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

// ── reports ──

export function useAdminReports(query: ReportListQueryT) {
  return useQuery({
    queryKey: ['admin', 'reports', query],
    queryFn: () => api.get<ReportListResponseT>(`/admin/reports${qs(query)}`),
  });
}

export function useResolveReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, body }: { reportId: string; body: ReportResolveBodyT }) =>
      api.patch<ReportDTOT>(`/admin/reports/${reportId}`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'reports'] });
      void client.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

// ── audit + flags + jobs ──

export function useAuditLog(query: AuditListQueryT) {
  return useQuery({
    queryKey: ['admin', 'audit', query],
    queryFn: () => api.get<AuditListResponseT>(`/admin/audit${qs(query)}`),
  });
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: () => api.get<{ flags: FeatureFlagDTOT[] }>('/admin/flags'),
  });
}

export function useUpdateFeatureFlags() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, boolean | number>) =>
      api.patch<{ flags: FeatureFlagDTOT[] }>('/admin/flags', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'flags'] });
      void client.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

export interface JobQueueInfo {
  queue: string;
  runs: Array<{ id: string | undefined; state: string; finishedAt: number | null; failedReason: string | null }>;
  nextRunAt: number | null;
}

export function useJobs() {
  return useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: () => api.get<JobQueueInfo[]>('/jobs'),
  });
}
