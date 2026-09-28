import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Clock, MessageSquare, CheckCircle, AlertTriangle, Users, Calendar, TrendingUp, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import type { Assignment, StudentProgressWithUser } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";

interface AssignmentAnalyticsProps {
  assignment: Assignment;
  onBack: () => void;
}

export function AssignmentAnalytics({ assignment, onBack }: AssignmentAnalyticsProps) {
  const { data: progressData, isLoading } = useQuery<StudentProgressWithUser[]>({
    queryKey: [`/api/progress/assignment/${assignment.id}`],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-analytics">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Assignments
        </Button>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-muted rounded w-1/4"></div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const totalStudents = progressData?.length || 0;
  const completedCount = progressData?.filter(p => p.status === 'completed').length || 0;
  const inProgressCount = progressData?.filter(p => p.status === 'in_progress' || p.status === 'summary_provided').length || 0;
  const notStartedCount = progressData?.filter(p => p.status === 'not_started').length || 0;

  const completionRate = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;
  const avgTimeSpent = totalStudents > 0 
    ? Math.round(progressData!.reduce((sum, p) => sum + (p.totalTimeSpent || 0), 0) / totalStudents)
    : 0;
  const avgMessages = totalStudents > 0
    ? Math.round(progressData!.reduce((sum, p) => sum + (p.messageCount || 0), 0) / totalStudents)
    : 0;

  // Chart data for pie chart
  const pieData = [
    { name: 'Completed', value: completedCount, color: '#10b981' },
    { name: 'In Progress', value: inProgressCount, color: '#3b82f6' },
    { name: 'Not Started', value: notStartedCount, color: '#94a3b8' }
  ].filter(d => d.value > 0);

  // Line chart data - showing time spent for each student
  const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];
  
  // Create chart data with each student as a separate data point
  const timeData = progressData?.map((student, idx) => ({
    name: student.studentName?.split(' ')[0] || 'Student',
    timeSpent: Math.floor((student.totalTimeSpent || 0) / 60), // Convert to minutes
    color: colors[idx % colors.length]
  })) || [];

  // Find struggling students (low engagement)
  const strugglingStudents = progressData?.filter(p => 
    p.status === 'in_progress' && (p.totalTimeSpent || 0) < 60 && (p.messageCount || 0) < 3
  ) || [];

  const formatTimeSpent = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-analytics">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Assignment Header */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <CardTitle className="text-2xl">{assignment.topic}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">{assignment.grade}</Badge>
            <Badge variant="secondary" className="font-medium">{assignment.subject}</Badge>
            <span className="text-muted-foreground">Analytics Overview</span>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Students</p>
                <p className="text-3xl font-bold" data-testid="text-total-students">{totalStudents}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completion Rate</p>
                <p className="text-3xl font-bold text-green-600" data-testid="text-completion-rate">{completionRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Time Spent</p>
                <p className="text-3xl font-bold text-blue-600" data-testid="text-avg-time">
                  {Math.floor(avgTimeSpent / 60)}m
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-500/10">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Messages</p>
                <p className="text-3xl font-bold text-purple-600" data-testid="text-avg-messages">{avgMessages}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      {totalStudents > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Progress Distribution Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Progress Distribution
              </CardTitle>
              <CardDescription>Visual breakdown of student status</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm">{completedCount} Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm">{inProgressCount} In Progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-400"></div>
                  <span className="text-sm">{notStartedCount} Not Started</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Student Engagement Line Chart - Time Spent Only */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Student Time Engagement
              </CardTitle>
              <CardDescription>Time spent by each student</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }} 
                    label={{ value: 'Students', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Time (minutes)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '8px', 
                      border: 'none', 
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      backgroundColor: 'white',
                      padding: '12px'
                    }}
                    formatter={(value: number) => [`${value} min`, 'Time Spent']}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={() => 'Time Spent'}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="timeSpent" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      return <circle cx={cx} cy={cy} r={6} fill={payload.color} stroke="white" strokeWidth={2} />;
                    }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Student Cards - Enhanced */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Student Details</h2>
          <Badge variant="outline">{totalStudents} {totalStudents === 1 ? 'Student' : 'Students'}</Badge>
        </div>

        {progressData && progressData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {progressData.map((progress, index) => (
              <Card
                  key={progress.studentId}
                  className="hover-elevate transition-shadow"
                  data-testid={`student-progress-${index}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate" data-testid={`student-name-${index}`}>
                          {progress.studentName || 'Unknown Student'}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge 
                            variant={progress.status === 'completed' ? 'default' : 'secondary'}
                          >
                            {progress.status === 'completed' ? '✓ Completed' :
                             progress.status === 'in_progress' ? '⏳ In Progress' :
                             '⭕ Not Started'}
                          </Badge>
                          {strugglingStudents.some(s => s.studentId === progress.studentId) && (
                            <Badge variant="outline">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Needs Help
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Message Count */}
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Messages</span>
                      </div>
                      <span className="text-xl font-semibold">{progress.messageCount || 0}</span>
                    </div>

                    {/* Time Spent */}
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Time Spent</span>
                      </div>
                      <span className="text-sm font-semibold">{formatTimeSpent(progress.totalTimeSpent || 0)}</span>
                    </div>

                    {/* Started Time */}
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Started</span>
                      </div>
                      <span className="text-sm font-semibold">
                        {progress.startedAt 
                          ? format(new Date(progress.startedAt), 'MMM d, h:mm a')
                          : 'Not started'}
                      </span>
                    </div>

                    {/* Completed Time */}
                    {progress.status === 'completed' && progress.completedAt && (
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Completed</span>
                        </div>
                        <span className="text-sm font-semibold">
                          {format(new Date(progress.completedAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="inline-flex p-4 rounded-full bg-muted mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Student Data Yet</h3>
              <p className="text-muted-foreground">
                Student progress will appear here once students start working on this assignment
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Struggling Students Alert */}
      {strugglingStudents.length > 0 && (
        <Card className="border-orange-300 bg-gradient-to-br from-orange-50 to-orange-100/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <AlertTriangle className="w-5 h-5" />
              {strugglingStudents.length} Student{strugglingStudents.length !== 1 ? 's' : ''} May Need Support
            </CardTitle>
            <CardDescription className="text-orange-700">
              These students have low engagement (less than 1 minute or fewer than 3 messages)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {strugglingStudents.map((student) => (
                <Badge key={student.studentId} variant="outline" className="text-orange-800 border-orange-400">
                  {student.studentName || 'Unknown Student'}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}