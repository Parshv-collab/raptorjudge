import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center flex flex-col items-center">
        <p className="font-mono text-display text-accent leading-none">404</p>
        <h1 className="text-h2 text-primary mt-6">Page not found</h1>
        <p className="text-sm text-secondary mt-2 mb-8 leading-relaxed max-w-sm">
          The page or resource you were looking for does not exist or may have been moved.
        </p>
        <Link to="/">
          <Button variant="primary" size="md">
            Return to homepage
          </Button>
        </Link>
      </div>
    </div>
  );
}
