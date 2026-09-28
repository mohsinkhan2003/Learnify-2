import { useEffect } from 'react';
import { Link, useLocation } from "wouter";
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, Bot, Loader2 } from "lucide-react";
import learnifyLogo from "@assets/generated_images/LEARNIFY_modern_education_logo_icon_6ea43332.png";
import { InstallPWA } from "@/components/install-pwa";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loading-auth" />
      </div>
    );
  }

  // Role-based portal visibility
  const showTeacherPortal = !user || user.role === 'teacher';
  const showStudentPortal = !user || user.role === 'student';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-5xl w-full">
        {/* Hero - Responsive */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-4 sm:mb-6 flex flex-col items-center gap-4">
            <img 
              src={learnifyLogo} 
              alt="LEARNIFY Logo" 
              className="w-24 h-24 sm:w-32 sm:h-32" 
              data-testid="img-logo"
            />
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent" data-testid="text-app-title">
              LEARNIFY
            </h1>
          </div>
          <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
            An intelligent tutoring system where teachers assign topics and AI guides students through interactive learning
          </p>
        </div>

        {/* Role Selection - Simplified, Catchier Design */}
        <div className={`grid gap-6 max-w-2xl mx-auto ${showTeacherPortal && showStudentPortal ? 'sm:grid-cols-2' : 'max-w-md'}`}>
          {/* Teacher Portal */}
          {showTeacherPortal && (
            <Card className="hover-elevate active-elevate-2 border-2 border-primary/20">
              <CardContent className="pt-8 pb-6 px-6 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <GraduationCap className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">I'm a Teacher</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Create assignments, track progress, empower learning
                </p>
                <Link href={user ? "/dashboard" : "/signup"}>
                  <Button 
                    className="w-full" 
                    size="lg"
                    data-testid="button-teacher"
                  >
                    {user ? "Go to Dashboard" : "Get Started"}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Student Portal */}
          {showStudentPortal && (
            <Card className="hover-elevate active-elevate-2 border-2 border-chart-5/20">
              <CardContent className="pt-8 pb-6 px-6 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Bot className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">I'm a Student</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Learn with AI, master concepts, achieve excellence
                </p>
                <Link href={user ? "/dashboard" : "/signup"}>
                  <Button 
                    className="w-full" 
                    size="lg"
                    variant="secondary"
                    data-testid="button-student"
                  >
                    {user ? "Go to Dashboard" : "Start Learning"}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Demo Info */}
        <Card className="mt-8 max-w-3xl mx-auto border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Demo Mode</h3>
                <p className="text-sm text-muted-foreground">
                  This is a demonstration of Learnify. Teachers can create assignments
                  and students can interact with the AI tutor to learn through guided conversations.
                  In production, students would receive mobile notifications at scheduled times.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* PWA Install Prompt */}
      <InstallPWA />
    </div>
  );
}
