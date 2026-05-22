import { 
  useListRubricCriteria, 
  useCreateRubricCriterion, 
  useUpdateRubricCriterion, 
  useDeleteRubricCriterion,
  getListRubricCriteriaQueryKey
} from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { RubricCriterion } from "@workspace/api-client-react";

export function RubricPage() {
  const { data: criteria, isLoading } = useListRubricCriteria({});
  const [editingCriterion, setEditingCriterion] = useState<RubricCriterion | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (isLoading) return <div className="p-8">Loading rubric...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Grading Rubric</h1>
          <p className="text-muted-foreground mt-2">
            Configure the criteria the AI uses to grade employee calls.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Criterion
        </Button>
      </div>

      <div className="space-y-4">
        {criteria?.map(c => (
          <CriterionCard 
            key={c.id} 
            criterion={c} 
            onEdit={() => setEditingCriterion(c)} 
          />
        ))}
        {(!criteria || criteria.length === 0) && (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
            No criteria defined. Add some to start grading calls!
          </div>
        )}
      </div>

      <CriterionDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
      />
      {editingCriterion && (
        <CriterionDialog 
          open={true} 
          onOpenChange={(v) => !v && setEditingCriterion(null)} 
          criterion={editingCriterion} 
        />
      )}
    </div>
  );
}

function CriterionCard({ criterion, onEdit }: { criterion: RubricCriterion; onEdit: () => void }) {
  const update = useUpdateRubricCriterion();
  const remove = useDeleteRubricCriterion();
  const queryClient = useQueryClient();

  const handleToggleActive = async (active: boolean) => {
    try {
      await update.mutateAsync({ id: criterion.id, data: { active } });
      queryClient.invalidateQueries({ queryKey: getListRubricCriteriaQueryKey() });
      toast.success("Criterion updated");
    } catch (e) {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure? Past grades will remain, but future calls won't use this.")) return;
    try {
      await remove.mutateAsync({ id: criterion.id });
      queryClient.invalidateQueries({ queryKey: getListRubricCriteriaQueryKey() });
      toast.success("Criterion deleted");
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className={`p-5 border rounded-lg shadow-sm transition-colors ${criterion.active ? "bg-card" : "bg-muted/30 opacity-75"}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{criterion.name}</h3>
          <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs font-medium uppercase tracking-wider">
            {criterion.appliesTo}
          </span>
          <span className="text-xs text-muted-foreground">Weight: {criterion.weight}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch checked={criterion.active} onCheckedChange={handleToggleActive} />
            <Label className="text-xs">{criterion.active ? "Active" : "Inactive"}</Label>
          </div>
          <div className="flex items-center gap-1 border-l pl-4">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={onEdit}>
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mt-3 p-3 bg-muted/30 rounded border border-dashed">
        <span className="font-mono text-xs opacity-50 block mb-1">Prompt Instruction:</span>
        {criterion.description}
      </p>
    </div>
  );
}

function CriterionDialog({ open, onOpenChange, criterion }: { open: boolean, onOpenChange: (open: boolean) => void, criterion?: RubricCriterion }) {
  const isEditing = !!criterion;
  const create = useCreateRubricCriterion();
  const update = useUpdateRubricCriterion();
  const queryClient = useQueryClient();

  const [name, setName] = useState(criterion?.name || "");
  const [description, setDescription] = useState(criterion?.description || "");
  const [weight, setWeight] = useState(criterion?.weight?.toString() || "1.0");
  const [appliesTo, setAppliesTo] = useState<"inbound"|"outbound"|"all">(criterion?.appliesTo || "all");

  const handleSave = async () => {
    if (!name || !description) {
      toast.error("Name and description are required");
      return;
    }

    const payload = {
      name,
      description,
      weight: parseFloat(weight),
      appliesTo
    };

    try {
      if (isEditing && criterion) {
        await update.mutateAsync({ id: criterion.id, data: payload });
        toast.success("Criterion updated");
      } else {
        await create.mutateAsync({ data: payload });
        toast.success("Criterion created");
      }
      queryClient.invalidateQueries({ queryKey: getListRubricCriteriaQueryKey() });
      onOpenChange(false);
      
      // Reset form if creating
      if (!isEditing) {
        setName("");
        setDescription("");
        setWeight("1.0");
        setAppliesTo("all");
      }
    } catch (e) {
      toast.error("Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Criterion" : "Add Rubric Criterion"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Discovery & Discovery Questions" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desc">AI Prompt / Description</Label>
            <Textarea 
              id="desc" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Tell the AI how to grade this on a 1-5 scale..."
              className="h-32 font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Applies To</Label>
              <Select value={appliesTo} onValueChange={(v: any) => setAppliesTo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Calls</SelectItem>
                  <SelectItem value="inbound">Inbound Only</SelectItem>
                  <SelectItem value="outbound">Outbound Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weight">Weight Multiplier</Label>
              <Input 
                id="weight" 
                type="number" 
                step="0.1" 
                value={weight} 
                onChange={e => setWeight(e.target.value)} 
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending || update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
