'use client';
import { useRouter } from 'next/navigation'; import { useState } from 'react'; import { useAuth } from '@/features/auth/auth-provider';
export function LogoutButton({ className = '' }: { className?: string }) { const router = useRouter(); const { logout } = useAuth(); const [busy, setBusy] = useState(false); return <button type="button" disabled={busy} className={className} onClick={async () => { if (busy) return; setBusy(true); try { await logout() } finally { router.replace('/login'); router.refresh() } }}>{busy ? 'Signing out…' : 'Sign out'}</button> }
