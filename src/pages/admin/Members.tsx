import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { MemberDetailSheet } from "@/components/admin/MemberDetailSheet";
import { MemberFormDialog } from "@/components/admin/MemberFormDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, ChevronLeft, ChevronRight, Plus, CheckCircle2, Filter } from "lucide-react";
import { toast } from "sonner";
import { useMembers, useMemberSearch, useCreateAdminMember } from "@/hooks/admin/useMembers";
import { useGyms } from "@/hooks/admin/useGyms";
import { ApiError } from "@/lib/auth-context";
import { Member } from "@/lib/types";

const PAGE_SIZE = 25;

type SortBy = "createdAt" | "name" | "memberCode";

export default function Members() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [gymId, setGymId] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [createdMember, setCreatedMember] = useState<Member | null>(null);
  const createMember = useCreateAdminMember();
  const { data: gyms } = useGyms();

  const isSearching = search.trim().length >= 3;
  const list = useMembers({ skip: page * PAGE_SIZE, take: PAGE_SIZE, gymId: gymId === "all" ? undefined : gymId, sortBy, sortOrder });
  const searchResult = useMemberSearch(search.trim());

  const rows = isSearching ? searchResult.data ?? [] : list.data?.data ?? [];
  const isLoading = isSearching ? searchResult.isLoading : list.isLoading;
  const total = list.data?.meta?.total ?? 0;

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Members</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Search across every gym. Click a member to see their full gym and session history.
          </p>
        </div>
        <Button className="btn-cerise gap-2" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> New Member
        </Button>
      </div>

      <div className="relative mb-3 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by member code, name, or phone..."
          className="pl-9"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {/* Filter + sort controls — gym filter narrows the list to members
          currently assigned to one branch ("All gyms" for the whole
          platform), sort picks the column/order for the paginated view. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Gym</span>
        </div>
        <Select
          value={gymId}
          onValueChange={(v) => {
            setGymId(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All gyms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All gyms</SelectItem>
            {gyms
              ?.filter((g) => g.status !== "deleted")
              .map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 ml-2 text-muted-foreground">
          <span className="text-xs font-medium">Sort</span>
        </div>
        <Select
          value={sortBy}
          onValueChange={(v) => {
            setSortBy(v as SortBy);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Joined date</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="memberCode">Member code</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortOrder}
          onValueChange={(v) => {
            setSortOrder(v as "asc" | "desc");
            setPage(0);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortBy === "createdAt" ? (
              <>
                <SelectItem value="desc">Newest first</SelectItem>
                <SelectItem value="asc">Oldest first</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="asc">A → Z</SelectItem>
                <SelectItem value="desc">Z → A</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Current Gym</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {isSearching ? "No members match that search." : "No members yet."}
                </TableCell>
              </TableRow>
            )}

            {rows.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => setSelectedId(m.id)}>
                <TableCell className="font-medium hover:text-primary">{m.name}</TableCell>
                <TableCell className="font-mono text-xs">{m.memberCode}</TableCell>
                <TableCell>{m.currentGym?.name || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                <TableCell>
                  <StatusBadge status={m.status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(m.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!isSearching && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <MemberDetailSheet memberId={selectedId} onOpenChange={(open) => !open && setSelectedId(null)} />

      <MemberFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        loading={createMember.isPending}
        onSubmit={(values) => {
          createMember.mutate(values, {
            onSuccess: (member) => {
              setFormOpen(false);
              setCreatedMember(member);
            },
            onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create member."),
          });
        }}
      />

      {/* Creation success — reveal Member ID + PIN once, staff hand these to the member */}
      <Dialog open={!!createdMember} onOpenChange={(o) => !o && setCreatedMember(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
            </div>
            <DialogTitle className="text-center">Member Created!</DialogTitle>
          </DialogHeader>
          {createdMember && (
            <div className="bg-muted rounded-lg p-4 text-center space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Member ID</p>
                <code className="text-lg font-mono">{createdMember.memberCode}</code>
              </div>
              {createdMember.pin && (
                <div className="space-y-1 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">Login PIN</p>
                  <code className="text-lg font-mono tracking-widest">{createdMember.pin}</code>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-center text-muted-foreground">
            Give this ID + PIN to the member to log in to the UV Active app. It's also
            {createdMember?.phone ? " sent by SMS" : ""}
            {createdMember?.phone && createdMember?.email ? " and" : ""}
            {createdMember?.email ? ` emailed to ${createdMember.email}` : ""} as a backup — it won't be shown here again.
          </p>
          <DialogFooter>
            <Button className="w-full btn-cerise" onClick={() => setCreatedMember(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
