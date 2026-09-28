import { useState } from "react";
import { Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Archive, ClipboardList, Plus } from "lucide-react";
import type { Paginated, TeacherAssignmentListItem } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardSkeleton, EmptyState, ErrorState, PageHeader } from "@/components/common/states";
import { apiGet } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { AssignmentCard } from "./components";

const PAGE = 24;

export default function AssignmentsPage() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const archived = tab === "archived";
  const query = useInfiniteQuery({
    queryKey: queryKeys.teacherAssignments(archived),
    queryFn: ({ pageParam }) =>
      apiGet<Paginated<TeacherAssignmentListItem>>(`/api/teacher/assignments?limit=${PAGE}&offset=${pageParam}&archived=${archived}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Assignments"
        description="Everything you've set, with live progress from your students."
        actions={
          <Button asChild>
            <Link href="/teacher/assignments/new">
              <Plus aria-hidden /> New assignment
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="active">Current</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        archived ? (
          <EmptyState icon={<Archive />} title="No archived assignments" description="Archived assignments are hidden from students but keep all their progress data." />
        ) : (
          <EmptyState
            icon={<ClipboardList />}
            title="Create your first assignment"
            description="Choose a topic, add guidance for the AI tutor, and pick when students should see it."
            action={
              <Button asChild>
                <Link href="/teacher/assignments/new">
                  <Plus aria-hidden /> New assignment
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
