'use client';

import { useState } from 'react';

import { toast } from 'sonner';
import { deleteFood, saveFood } from '@/lib/actions/foods';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/domain/grocery';
import { UNIT_DEFINITIONS } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { DeleteButton } from '@/components/ui/delete-button';
import { Input, NumberInput, Textarea } from '@/components/ui/input';
import { Label, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { SheetFooter } from '@/components/ui/sheet';

export interface FoodFormValues {
  id?: string;
  name: string;
  category: string;
  defaultUnit: string;
  department: string;
  bulkClass: string;
  storageDefault: string;
  packageSize: string;
  packageUnit: string;
  tracksYield: boolean;
  cookingYieldPct: string;
  nutritionBasisQty: string;
  nutritionBasisUnit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fibre: string;
  sodium: string;
  notes: string;
  active: boolean;
}

const BULK_CLASSES = [
  { value: 'EXCELLENT', label: 'Excellent bulk buy' },
  { value: 'GOOD_IF_FROZEN', label: 'Good bulk buy if frozen' },
  { value: 'BUY_FRESH', label: 'Buy fresh' },
  { value: 'NOT_CLASSIFIED', label: 'Not classified' },
] as const;

const LOCATIONS = [
  { value: 'PANTRY', label: 'Pantry' },
  { value: 'FRIDGE', label: 'Refrigerator' },
  { value: 'FREEZER', label: 'Freezer' },
] as const;

export const EMPTY_FOOD: FoodFormValues = {
  name: '',
  category: 'OTHER',
  defaultUnit: 'g',
  department: '',
  bulkClass: 'NOT_CLASSIFIED',
  storageDefault: 'PANTRY',
  packageSize: '',
  packageUnit: '',
  tracksYield: false,
  cookingYieldPct: '',
  nutritionBasisQty: '100',
  nutritionBasisUnit: 'g',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fibre: '',
  sodium: '',
  notes: '',
  active: true,
};

export function FoodForm({
  initial,
  departments,
  onDone,
  onCancel,
}: {
  initial?: Partial<FoodFormValues>;
  departments: string[];
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<FoodFormValues>({ ...EMPTY_FOOD, ...initial });

  const finish = () => {
    onDone?.();
  };

  const save = useAction(saveFood, {
    onSuccess: finish,
    onNeedsConfirmation: (message) => {
      toast.warning(message, {
        action: { label: 'Save anyway', onClick: () => submit(true) },
      });
    },
  });

  const remove = useAction(deleteFood, {
    onSuccess: finish,
    // The server knows which meals lose a line; it says so before anything is
    // deleted rather than reporting it afterwards.
    onNeedsConfirmation: (message) => {
      toast.warning(message, {
        duration: 10_000,
        action: { label: 'Delete anyway', onClick: () => remove.run({ id: values.id!, confirm: true }) },
      });
    },
  });

  const set = <K extends keyof FoodFormValues>(key: K, value: FoodFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (confirmYield = false) =>
    save.run({ ...values, confirmYield } as unknown as Parameters<typeof saveFood>[0]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="basics">
        <TabsList>
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="shopping">Shopping</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
        </TabsList>

        {/* Basics ---------------------------------------------------------- */}
        <TabsContent value="basics" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="food-name">Name</Label>
            <Input
              id="food-name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={Boolean(save.fieldErrors.name)}
            />
            {save.fieldErrors.name ? (
              <FieldError>{save.fieldErrors.name[0]}</FieldError>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="food-category">Category</Label>
              <Select
                id="food-category"
                value={values.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-unit">Default unit</Label>
              <Select
                id="food-unit"
                value={values.defaultUnit}
                onChange={(e) => set('defaultUnit', e.target.value)}
              >
                {UNIT_DEFINITIONS.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">
                Track a cooking yield
                <span className="block text-xs text-muted-foreground">
                  For foods planned by cooked weight but bought raw.
                </span>
              </span>
              <Switch
                checked={values.tracksYield}
                onCheckedChange={(checked) => set('tracksYield', checked)}
              />
            </label>

            {values.tracksYield ? (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="food-yield">Cooking yield (%)</Label>
                <NumberInput
                  id="food-yield"
                  value={values.cookingYieldPct}
                  onChange={(e) => set('cookingYieldPct', e.target.value)}
                  placeholder="75"
                  aria-invalid={Boolean(save.fieldErrors.cookingYieldPct)}
                />
                <p className="text-xs text-muted-foreground">
                  Cooked weight ÷ raw weight. Meat is usually 75–80%. Rice and oats gain weight, so they
                  are above 100%.
                </p>
                {save.fieldErrors.cookingYieldPct ? (
                  <FieldError>{save.fieldErrors.cookingYieldPct[0]}</FieldError>
                ) : null}
              </div>
            ) : null}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="text-sm">Active</span>
            <Switch checked={values.active} onCheckedChange={(checked) => set('active', checked)} />
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="food-notes">Notes</Label>
            <Textarea
              id="food-notes"
              className="min-h-16"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </TabsContent>

        {/* Shopping -------------------------------------------------------- */}
        <TabsContent value="shopping" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="food-department">Store department</Label>
            <Input
              id="food-department"
              list="departments"
              value={values.department}
              onChange={(e) => set('department', e.target.value)}
              placeholder="Meat & Seafood"
            />
            <datalist id="departments">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">Used to group items in Shopping Mode.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="food-package">Package size</Label>
              <NumberInput
                id="food-package"
                value={values.packageSize}
                onChange={(e) => set('packageSize', e.target.value)}
                placeholder="1000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-package-unit">Package unit</Label>
              <Select
                id="food-package-unit"
                value={values.packageUnit}
                onChange={(e) => set('packageUnit', e.target.value)}
                aria-invalid={Boolean(save.fieldErrors.packageUnit)}
              >
                <option value="">None</option>
                {UNIT_DEFINITIONS.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave the package size empty and the grocery list simply shows the amount needed, with no
            package estimate.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="food-bulk">Bulk buying</Label>
              <Select
                id="food-bulk"
                value={values.bulkClass}
                onChange={(e) => set('bulkClass', e.target.value)}
              >
                {BULK_CLASSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-storage">Stored in</Label>
              <Select
                id="food-storage"
                value={values.storageDefault}
                onChange={(e) => set('storageDefault', e.target.value)}
              >
                {LOCATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* Nutrition ------------------------------------------------------- */}
        <TabsContent value="nutrition" className="space-y-4">
          <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
            Nutrition is optional. Anything you leave blank shows as unknown rather than zero, and the
            app works fine without it. Seeded values are rough estimates — replace them with what is on
            your packaging.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="food-basis">Values per</Label>
              <NumberInput
                id="food-basis"
                value={values.nutritionBasisQty}
                onChange={(e) => set('nutritionBasisQty', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-basis-unit">Unit</Label>
              <Select
                id="food-basis-unit"
                value={values.nutritionBasisUnit}
                onChange={(e) => set('nutritionBasisUnit', e.target.value)}
              >
                {UNIT_DEFINITIONS.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['calories', 'Calories (kcal)'],
                ['protein', 'Protein (g)'],
                ['carbs', 'Carbs (g)'],
                ['fat', 'Fat (g)'],
                ['fibre', 'Fibre (g)'],
                ['sodium', 'Sodium (mg)'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`food-${key}`}>{label}</Label>
                <NumberInput
                  id={`food-${key}`}
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {values.id ? (
        <DeleteButton
          label="Delete food"
          title={`Delete ${values.name}?`}
          description="It is removed from your plan and future grocery lists. Days you have already logged keep their record."
          pending={remove.isPending}
          onConfirm={() => remove.run({ id: values.id! })}
          className="w-full"
        />
      ) : null}

      {save.error ? <FieldError>{save.error}</FieldError> : null}

      <SheetFooter>
        {onCancel ? (
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button className="flex-1" disabled={save.isPending} onClick={() => submit()}>
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}
