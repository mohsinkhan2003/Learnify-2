import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { GraduationCap, Loader2, User, UserPlus } from 'lucide-react';
import learnifyLogo from "@assets/generated_images/LEARNIFY_modern_education_logo_icon_6ea43332.png";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'student'>('student');
  const [subject, setSubject] = useState(''); // For teachers
  const [school, setSchool] = useState(''); // For both teachers and students
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (!school.trim()) {
      setError('School/College name is required');
      setLoading(false);
      return;
    }

    if (role === 'teacher' && !subject.trim()) {
      setError('Subject is required for teachers');
      setLoading(false);
      return;
    }

    try {
      const newUser = await signup(email, password, name, role, school, role === 'teacher' ? subject : undefined);
      // Redirect to unified dashboard (role-based content will be shown)
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
      <div className="w-full max-w-md my-8">
        <div className="flex flex-col items-center gap-6 mb-8">
          <div className="flex flex-col items-center gap-3">
            <img src={learnifyLogo} alt="LEARNIFY Logo" className="w-16 h-16" data-testid="icon-logo" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">LEARNIFY</h1>
          </div>
          <p className="text-muted-foreground text-center">
            Create your account to get started
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <CardDescription>Sign up as a teacher or student</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
              {error && (
                <Alert variant="destructive" data-testid="alert-error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <Label>I am a</Label>
                <RadioGroup value={role} onValueChange={(value) => setRole(value as 'teacher' | 'student')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="student" id="student" data-testid="radio-student" />
                    <Label htmlFor="student" className="flex items-center gap-2 cursor-pointer font-normal">
                      <User className="w-4 h-4" />
                      Student
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="teacher" id="teacher" data-testid="radio-teacher" />
                    <Label htmlFor="teacher" className="flex items-center gap-2 cursor-pointer font-normal">
                      <UserPlus className="w-4 h-4" />
                      Teacher
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                  data-testid="input-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="student@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  data-testid="input-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="school">School/College Name</Label>
                <Input
                  id="school"
                  type="text"
                  placeholder="University of Example"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  required
                  disabled={loading}
                  data-testid="input-school"
                />
              </div>

              {role === 'teacher' && (
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    type="text"
                    placeholder="e.g., Mathematics, English, Physics"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    disabled={loading}
                    data-testid="input-subject"
                  />
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
                data-testid="button-signup"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </Button>

              <div className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setLocation('/login')}
                  className="text-primary hover:underline font-medium"
                  data-testid="link-login"
                >
                  Sign in
                </button>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
