import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateMoleculeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateMolecule: (name: string) => void;
}

const CreateMoleculeDialog: React.FC<CreateMoleculeDialogProps> = ({
  open,
  onOpenChange,
  onCreateMolecule
}) => {
  const [moleculeName, setMoleculeName] = useState('New Molecule');

  const handleCreate = () => {
    if (moleculeName.trim()) {
      onCreateMolecule(moleculeName);
      setMoleculeName('New Molecule');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
        <DialogHeader>
          <DialogTitle>Create New Molecule</DialogTitle>
          <DialogDescription>
            Enter a name for your new molecule box. You can add atoms to it later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="molecule-name">Molecule Name</Label>
            <Input
              id="molecule-name"
              value={moleculeName}
              onChange={(e) => setMoleculeName(e.target.value)}
              placeholder="Enter molecule name"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>
            Create Molecule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateMoleculeDialog;
