import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-xl">AG</div>
          <h1 className="text-3xl font-bold text-white">Al Ghani Traders</h1>
          <p className="text-blue-300 mt-1">ERP Management System</p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label text-white/80">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required
                  className="input pl-10 bg-white/10 border-white/20 text-white placeholder-white/40 focus:ring-blue-400" />
              </div>
            </div>
            <div>
              <label className="label text-white/80">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  className="input pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder-white/40 focus:ring-blue-400" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 text-base mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/forgot-password"><a className="text-blue-300 hover:text-blue-200 text-sm">Forgot password?</a></Link>
          </div>
        </div>
        <p className="text-center text-white/40 text-xs mt-6">Al Ghani Wholesale Traders &copy; 2026</p>
      </div>
    </div>
  );
}
