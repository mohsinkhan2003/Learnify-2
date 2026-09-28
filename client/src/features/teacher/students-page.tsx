import { useDeferredValue, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import type { Paginated, TeacherStudentRow } from "@shared/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common/states";
import { useAuth } from "@/features/auth/use-auth";
import { apiGet } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export default function StudentsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const query = useInfiniteQuery({
    queryKey: queryKeys.teacherStudents(deferred),
    queryFn: ({ pageParam }) =>
      apiGet<Paginated<TeacherStudentRow>>(`/api/teacher/students?limit=50&offset=${pageParam}&search=${encodeURIComponent(deferred)}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Students" description={`Students at ${user?.school ?? "your school"} and their activity on your current assignments.`} />
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" placeholder="Search by name" aria-label="Search students" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={deferred ? "No students match your search" : "No students yet"}
          description={deferred ? "Try a different name." : `Students appear here when they sign up with the school name "${user?.school}".`}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Signals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </TableCell>
                    <TableCell className="tabular text-right">{s.assignmentsStarted}</TableCell>
                    <TableCell className="tabular text-right">{s.assignmentsCompleted}</TableCell>
                    <TableCell className="tabular text-right">{formatDuration(s.totalTimeSeconds)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatRelative(s.lastActiveAt)}</TableCell>
                    <TableCell>
                      {s.insightCount > 0 ? <Badge variant="warning">{s.insightCount} to review</Badge> : <span className="text-helper">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
