import { Link } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-14rem)] flex items-center justify-center py-12 px-4">
      <GlassCard className="max-w-md w-full p-8 text-center flex flex-col items-center shadow-xl">
        <div className="w-16 h-16 rounded-3xl bg-[#ff0055]/10 text-[#ff0055] flex items-center justify-center font-black text-2xl mb-4">
          404
        </div>
        <h1 className="text-xl font-extrabold text-[#1d1d1f]">Page Not Found</h1>
        <p className="text-xs text-[#6e6e73] mt-2 mb-6 leading-relaxed">
          The page or resource you were looking for does not exist or may have been moved.
        </p>
        <Link to="/">
          <Button variant="primary" size="md">
            Return to Homepage
          </Button>
        </Link>
      </GlassCard>
    </div>
  );
}
