export type UserRole = 'FARMER' | 'AGRICULTURE_EXPERT' | 'FIELD_WORKER' | 'NGO_VIEWER' | 'GOVERNMENT_VIEWER' | 'ADMIN' | 'SUPER_ADMIN';
export interface CurrentUser { id: string; email: string | null; phone: string | null; role: UserRole; status: 'pending' | 'active' | 'suspended' }
export interface ApiErrorBody { error?: { code?: string; message?: string; details?: unknown } }
