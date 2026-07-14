import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Mail, Lock, KeyRound, ArrowLeft } from 'lucide-react';

type Step = 'email' | 'otp' | 'reset' | 'done';

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();

  const sendOTP = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      toast.success('OTP sent to your email');
      setStep('otp');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const verifyOTP = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post('/auth/verify-otp', { email, otp });
      setStep('reset');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Invalid OTP'); }
    finally { setLoading(false); }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) return toast.error('Passwords do not match');
    if (newPassword.length < 6) return toast.error('Password too short');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, otp, newPassword });
      toast.success('Password reset! Please login.');
      setStep('done');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">AG</div>
          <h1 className="text-2xl font-bold text-white">Reset Password</h1>
        </div>
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 shadow-2xl">
          {step === 'email' && (
            <form onSubmit={sendOTP} className="space-y-4">
              <p className="text-white/70 text-sm">Enter your email to receive a one-time password.</p>
              <div>
                <label className="label text-white/80">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com"
                    className="input pl-10 bg-white/10 border-white/20 text-white placeholder-white/40" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">{loading ? 'Sending...' : 'Send OTP'}</button>
            </form>
          )}
          {step === 'otp' && (
            <form onSubmit={verifyOTP} className="space-y-4">
              <p className="text-white/70 text-sm">Enter the 6-digit OTP sent to <strong className="text-white">{email}</strong></p>
              <div>
                <label className="label text-white/80">OTP Code</label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value)} required maxLength={6} placeholder="123456"
                    className="input pl-10 bg-white/10 border-white/20 text-white placeholder-white/40 tracking-widest text-center text-lg" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">{loading ? 'Verifying...' : 'Verify OTP'}</button>
            </form>
          )}
          {step === 'reset' && (
            <form onSubmit={resetPassword} className="space-y-4">
              <p className="text-white/70 text-sm">Set your new password.</p>
              <div>
                <label className="label text-white/80">New Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
                    className="input pl-10 bg-white/10 border-white/20 text-white" />
                </div>
              </div>
              <div>
                <label className="label text-white/80">Confirm Password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                  className="input bg-white/10 border-white/20 text-white" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">{loading ? 'Resetting...' : 'Reset Password'}</button>
            </form>
          )}
          {step === 'done' && (
            <div className="text-center text-green-400">
              <div className="text-4xl mb-3">✓</div>
              <p className="text-white font-semibold">Password reset successfully!</p>
              <p className="text-white/60 text-sm mt-1">Redirecting to login...</p>
            </div>
          )}
          <div className="mt-4 text-center">
            <Link href="/login"><a className="text-blue-300 hover:text-blue-200 text-sm flex items-center justify-center gap-1"><ArrowLeft size={14} /> Back to Login</a></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
