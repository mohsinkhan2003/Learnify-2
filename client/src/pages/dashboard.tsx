import { useAuth } from "@/contexts/auth-context";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import TeacherDashboard from "./teacher-dashboard";
import StudentHome from "./student-home";

export default function Dashboard() {
  const { user, loading } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loading-dashboard" />
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    return <Redirect to="/login" replace />;
  }

  // Render appropriate dashboard based on user role
  if (user.role === "teacher") {
    return <TeacherDashboard />;
  }

  if (user.role === "student") {
    return <StudentHome />;
  }

  // Fallback for unknown roles
  return <Redirect to="/login" replace />;
}
