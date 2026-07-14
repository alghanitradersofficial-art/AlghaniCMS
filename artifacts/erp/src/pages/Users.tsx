import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Key, X, CheckCircle, XCircle, Shield } from 'lucide-react';

type User = { id: number; name: string; email: string; role: string; isActive: boolean; permissions: string[]; createdAt: string };

const ALL_PERMISSIONS = ['dashboard', 'inventory', 'sales', 'purchases', 'customers', 'suppliers', 'expenses', 'reports', 'users', 'settings', 'quick-entry', 'operations', 'months', 'customer-ledger', 'supplier-ledger'];
const ROLES = ['ceo', 'developer', 'manager', 'sales', 'accountant', 'warehouse', 'content'];
const ROLE_COLORS: Record<string, string> = { ceo: 'badge-red', developer: 'badge-blue', manager: 'badge-yellow', sales: 'badge-green', accountant: 'badge-gray', warehouse: 'badge-gray', content: 'badge-gray' };

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(user ? { name: user.name, email: user.email, phone: '', role: user.role, isActive: user.isActive, permissions: user.permissions, password: '' } : { name: '', email: '', phone: '', role: 'sales', isActive: true, permissions: [] as string[], password: '' });

  const togglePermission = (p: string) => setForm(f => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p] }));
  const grantAll = () => setForm(f => ({ ...f, permissions: [...ALL_PERMISSIONS] }));
  const revokeAll = () => setForm(f => ({ ...f, permissions: [] }));

  const { mutate, isPending } = useMutation({
    mutationFn: () => user ? api.put(`/users/${user.id}`, form) : api.post('/users', { ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success(user ? 'User updated' : 'User created'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">{user ? 'Edit User' : 'New User'}</h2><button onClick={onClose}><X size={20} /></button></div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Full Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="label">Role</label><select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>{ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}</select></div>
            <div><label className="label">{user ? 'New Password (leave blank to keep)' : 'Password'}</label><input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={user ? 'Leave blank to keep current' : 'Min 6 chars'} /></div>
            <div className="flex items-end gap-3"><label className="flex items-center gap-2 cursor-pointer mb-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} /><span className="font-medium">Active Account</span></label></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label !mb-0 flex items-center gap-1"><Shield size={14} />Permissions</label>
              <div className="flex gap-2"><button onClick={grantAll} className="btn-success btn-sm">Grant All</button><button onClick={revokeAll} className="btn-secondary btn-sm">Revoke All</button></div>
            </div>
            <p className="text-xs text-gray-500 mb-3">Note: CEO and Developer always have full access regardless of permissions.</p>
            <div className="grid grid-cols-3 gap-2">
              {ALL_PERMISSIONS.map(p => (
                <label key={p} className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg border transition-colors ${form.permissions.includes(p) ? 'bg-blue-50 border-blue-300 text-blue-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  <input type="checkbox" className="hidden" checked={form.permissions.includes(p)} onChange={() => togglePermission(p)} />
                  {form.permissions.includes(p) ? <CheckCircle size={14} className="text-blue-600" /> : <XCircle size={14} className="text-gray-300" />}
                  <span className="text-sm capitalize">{p.replace(/-/g, ' ')}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => mutate()} disabled={isPending} className="btn-primary">{isPending ? 'Saving...' : 'Save User'}</button></div>
      </div>
    </div>
  );
}

function OTPModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [otp, setOtp] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const generateOTP = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post(`/users/${user.id}/generate-otp`);
      setOtp(data.otp);
      toast.success('OTP sent to user\'s email');
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setGenerating(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">Generate OTP for {user.name}</h2><button onClick={onClose}><X size={20} /></button></div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Generate a one-time password for the user. The OTP will be sent to their email and shown below.</p>
          {otp && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-xs text-blue-600 mb-1">OTP Code</p>
              <p className="text-3xl font-bold tracking-widest text-blue-700">{otp}</p>
              <p className="text-xs text-gray-500 mt-2">Valid for 24 hours · Sent to {user.email}</p>
            </div>
          )}
          <button onClick={generateOTP} disabled={generating} className="btn-primary w-full justify-center"><Key size={14} />{generating ? 'Generating...' : 'Generate & Send OTP'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [otpUser, setOtpUser] = useState<User | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users?limit=100').then(r => r.data) });
  const { mutate: del } = useMutation({ mutationFn: (id: number) => api.delete(`/users/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted'); } });

  const users: User[] = data?.data || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Users & Permissions</h1><p className="text-gray-500 text-sm">{users.length} team members</p></div>
        <button onClick={() => { setEditUser(null); setShowModal(true); }} className="btn-primary"><Plus size={16} />Add User</button>
      </div>
      <div className="card">
        <div className="table-container"><table className="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr> :
             users.map(u => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-gray-500">{u.email}</td>
                <td><span className={`${ROLE_COLORS[u.role] || 'badge-gray'} capitalize`}>{u.role}</span></td>
                <td><span className={u.isActive ? 'badge-green' : 'badge-red'}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  {['ceo', 'developer'].includes(u.role) ? <span className="text-blue-600 text-xs font-semibold">Full Access</span> :
                   <span className="text-xs text-gray-500">{u.permissions.length} permissions</span>}
                </td>
                <td className="flex gap-1">
                  <button onClick={() => setOtpUser(u)} className="btn-secondary btn-sm" title="Generate OTP"><Key size={13} /></button>
                  <button onClick={() => { setEditUser(u); setShowModal(true); }} className="btn-secondary btn-sm"><Edit2 size={13} /></button>
                  <button onClick={() => confirm(`Delete ${u.name}?`) && del(u.id)} className="btn-danger btn-sm"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {showModal && <UserModal user={editUser} onClose={() => { setShowModal(false); setEditUser(null); }} />}
      {otpUser && <OTPModal user={otpUser} onClose={() => setOtpUser(null)} />}
    </div>
  );
}
