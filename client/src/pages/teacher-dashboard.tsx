import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Link, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, BookOpen, Clock, GraduationCap, ArrowLeft, BarChart3, LogOut } from "lucide-react"; // Added LogOut
import { Assignment } from "@shared/schema";
import { AssignmentForm } from "@/components/assignment-form";
import { AssignmentAnalytics } from "@/components/assignment-analytics";
import { format, isValid } from "date-fns";
import learnifyLogo from "@/assets/logo.svg";
import { useAuth } from "@/contexts/auth-context";

export default function TeacherDashboard() {
  const [showForm, setShowForm] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const searchString = useSearch();

  const { user, loading: isAuthLoading, logout: handleLogout } = useAuth();

  const { data: assignments, isLoading: isAssignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    enabled: !!user && user.role === 'teacher', // Only fetch if user is teacher
    retry: false,
  });

  const isLoading = isAuthLoading || isAssignmentsLoading;

  // Handle URL query param for analytics view
  useEffect(() => {
    if (!assignments || assignments.length === 0) return;
    
    const searchParams = new URLSearchParams(searchString);
    const analyticsId = searchParams.get('analytics');
    
    if (analyticsId && !selectedAssignment) {
      const assignment = assignments.find(a => a.id === analyticsId);
      if (assignment) {
        console.log('[TeacherDashboard] Auto-selecting assignment from URL:', assignment.id);
        setSelectedAssignment(assignment);
      }
    }
  }, [searchString, assignments, selectedAssignment]);

  // Debug logging
  console.log('[TeacherDashboard] Current user:', user?.email, 'Role:', user?.role);
  console.log('[TeacherDashboard] Assignments count:', assignments?.length);

  // Auth check is now handled by Dashboard wrapper component

  // Show assignment analytics
  if (selectedAssignment) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-6 md:p-8 lg:p-12">
          <AssignmentAnalytics
            assignment={selectedAssignment}
            onBack={() => setSelectedAssignment(null)}
          />
        </div>
      </div>
    );
  }

  // Show assignment form
  if (showForm) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-6 md:p-8 lg:p-12">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              data-testid="button-back"
            >
              ← Back to Dashboard
            </Button>
          </div>
          <AssignmentForm onSuccess={() => setShowForm(false)} />
        </div>
      </div>
    );
  }

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Role check is now handled by Dashboard wrapper component

  return (
    <div className="min-h-screen bg-background relative">
      
      {/* User Profile Header - Responsive */}
      <div className="fixed right-2 top-2 sm:right-4 sm:top-4 z-50">
        <div className="flex items-center gap-1 sm:gap-2 bg-card border rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 shadow-sm">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium">{user?.name || 'Teacher'}</span>
            <span className="text-xs text-muted-foreground capitalize">{user?.role || 'Teacher'}</span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-chart-3/20 flex items-center justify-center text-chart-3 font-semibold text-sm">
            {user?.name?.charAt(0).toUpperCase() || 'T'}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await handleLogout();
              window.location.href = '/';
            }}
            className="ml-0 sm:ml-2 w-8 h-8 sm:w-10 sm:h-10"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8 lg:p-12">
        {/* Hero Section - Responsive */}
        <div className="mb-8 sm:mb-12">
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-center">
              <img 
                src={learnifyLogo} 
                alt="Learnify" 
                className="h-10 sm:h-12 w-auto" 
              />
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2" data-testid="text-dashboard-title">
                Welcome, {user?.name?.split(' ')[0] || 'Teacher'}
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg">
                Create and manage homework assignments with AI assistance
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setShowForm(true)}
              data-testid="button-create-assignment"
              className="gap-2 w-full md:w-auto"
            >
              <Plus className="w-5 h-5" />
              Create Assignment
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Assignments</p>
                  <p className="text-3xl font-bold" data-testid="text-total-assignments">
                    {assignments?.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-chart-3/10">
                  <GraduationCap className="w-6 h-6 text-chart-3" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Topics</p>
                  <p className="text-3xl font-bold" data-testid="text-active-topics">
                    {assignments?.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-chart-4/10">
                  <Clock className="w-6 h-6 text-chart-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled Today</p>
                  <p className="text-3xl font-bold" data-testid="text-scheduled-today">
                    {assignments?.filter(a => {
                      const today = new Date().toDateString();
                      const assignmentDate = new Date(a.notificationTime);
                      return isValid(assignmentDate) && assignmentDate.toDateString() === today;
                    }).length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assignments List */}
        <div>
          <h2 className="text-2xl font-semibold mb-6">Assignments</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="gap-2">
                    <div className="h-6 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 bg-muted rounded mb-2"></div>
                    <div className="h-4 bg-muted rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : assignments && assignments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assignments.map(assignment => {
                const notificationTime = new Date(assignment.notificationTime);
                const isPast = notificationTime <= new Date();
                
                return (
                  <Card 
                    key={assignment.id} 
                    className="hover-elevate active-elevate-2 transition-shadow cursor-pointer"
                    onClick={() => setSelectedAssignment(assignment)}
                    data-testid={`card-assignment-${assignment.id}`}
                  >
                    <CardHeader className="gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg line-clamp-2">
                          {assignment.topic}
                        </CardTitle>
                        <Badge variant="secondary" className="shrink-0">
                          {assignment.grade}
                        </Badge>
                      </div>
                      <CardDescription>{assignment.subject}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span data-testid={`text-notification-time-${assignment.id}`}>
                          {isValid(notificationTime) 
                            ? `${isPast ? 'Released' : 'Scheduled for'} ${format(notificationTime, "PPp")}`
                            : "Invalid date"
                          }
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {assignment.instructions}
                      </p>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <Badge 
                          className={isPast 
                            ? "bg-chart-3/10 text-chart-3 border-0" 
                            : "bg-chart-4/10 text-chart-4 border-0"
                          }
                        >
                          {isPast ? 'Active' : 'Scheduled'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAssignment(assignment);
                          }}
                          data-testid={`button-view-analytics-${assignment.id}`}
                        >
                          <BarChart3 className="w-4 h-4" />
                          View Analytics
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-12">
              <div className="text-center">
                <div className="inline-flex p-4 rounded-full bg-muted mb-4">
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No assignments yet</h3>
                <p className="text-muted-foreground mb-6">
                  Create your first homework assignment to get started
                </p>
                <Button onClick={() => setShowForm(true)} data-testid="button-create-first">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Assignment
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}