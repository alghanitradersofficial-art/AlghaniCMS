import { Link } from 'wouter';
export default function NotFound() {
  return <div className="min-h-screen flex items-center justify-center"><div className="text-center"><h1 className="text-6xl font-bold text-gray-200">404</h1><p className="text-gray-500 mt-2">Page not found</p><Link href="/"><a className="btn-primary mt-4 inline-flex">Go Home</a></Link></div></div>;
}
