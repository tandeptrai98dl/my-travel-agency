"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast, Toaster } from "@/components/ui/toaster";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type ShowcaseLabels = Record<
  | "forms"
  | "overlays"
  | "name"
  | "email"
  | "message"
  | "messageHint"
  | "destination"
  | "chooseDestination"
  | "travelStyle"
  | "styleSlow"
  | "styleActive"
  | "newsletter"
  | "submit"
  | "errorRequired"
  | "errorEmail"
  | "saved"
  | "savedBody"
  | "failed"
  | "showToast"
  | "showError"
  | "openDialog"
  | "openSheet"
  | "dialogTitle"
  | "dialogBody"
  | "tooltip"
  | "tooltipBody"
  | "popover"
  | "popoverBody"
  | "tabOne"
  | "tabTwo"
  | "tabOneBody"
  | "tabTwoBody"
  | "faq"
  | "faqBody"
  | "close"
  | "notification"
  | "notifications"
  | "switchDemo",
  string
> & { destinations: { key: string; name: string }[] };

// Zod messages are keys; FormMessage translates them (the pattern for every form in Phases 2–5).
const schema = z.object({
  name: z.string().trim().min(1, "errorRequired"),
  email: z.email("errorEmail"),
  message: z.string().optional(),
  destination: z.string().min(1, "errorRequired"),
  style: z.enum(["slow", "active"]),
  newsletter: z.boolean(),
});
type Values = z.infer<typeof schema>;

/** The client-side half of /admin/design-system: forms, overlays and toasts. */
export function InteractiveShowcase({ labels }: { labels: ShowcaseLabels }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", message: "", destination: "", style: "slow", newsletter: false },
  });
  const translate = (key: string) => (key in labels ? labels[key as keyof ShowcaseLabels] : key) as string;

  return (
    <TooltipProvider delayDuration={300}>
      <section aria-labelledby="ds-forms" className="flex flex-col gap-6">
        <h2 id="ds-forms" className="font-serif text-h2 font-medium">
          {labels.forms}
        </h2>
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() => toast({ title: labels.saved, variant: "success" }))}
            className="grid max-w-2xl gap-6 md:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{labels.name}</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage formatMessage={translate} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{labels.email}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage formatMessage={translate} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{labels.destination}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={labels.chooseDestination} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {labels.destinations.map((d) => (
                        <SelectItem key={d.key} value={d.key}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage formatMessage={translate} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="style"
              render={({ field }) => (
                <FormItem>
                  <p id="ds-style-label" className="text-small font-medium leading-none">
                    {labels.travelStyle}
                  </p>
                  <FormControl>
                    <RadioGroup
                      aria-labelledby="ds-style-label"
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-6"
                    >
                      {(["slow", "active"] as const).map((value) => (
                        <div key={value} className="flex items-center gap-2">
                          <RadioGroupItem value={value} id={`ds-style-${value}`} />
                          <Label htmlFor={`ds-style-${value}`}>
                            {value === "slow" ? labels.styleSlow : labels.styleActive}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{labels.message}</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormDescription>{labels.messageHint}</FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newsletter"
              render={({ field }) => (
                <FormItem className="flex-row items-center gap-3 md:col-span-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  </FormControl>
                  <FormLabel>{labels.newsletter}</FormLabel>
                </FormItem>
              )}
            />
            <div className="flex items-center gap-3 md:col-span-2">
              <Switch id="ds-switch" aria-label={labels.switchDemo} />
              <Button type="submit">{labels.submit}</Button>
            </div>
          </form>
        </Form>
      </section>

      <section aria-labelledby="ds-overlays" className="flex flex-col gap-6">
        <h2 id="ds-overlays" className="font-serif text-h2 font-medium">
          {labels.overlays}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">{labels.openDialog}</Button>
            </DialogTrigger>
            <DialogContent closeLabel={labels.close}>
              <DialogHeader>
                <DialogTitle>{labels.dialogTitle}</DialogTitle>
                <DialogDescription>{labels.dialogBody}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>{labels.close}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">{labels.openSheet}</Button>
            </SheetTrigger>
            <SheetContent closeLabel={labels.close}>
              <SheetTitle>{labels.dialogTitle}</SheetTitle>
              <SheetDescription>{labels.dialogBody}</SheetDescription>
            </SheetContent>
          </Sheet>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton label={labels.tooltip} icon={<Info strokeWidth={1.5} />} />
            </TooltipTrigger>
            <TooltipContent>{labels.tooltipBody}</TooltipContent>
          </Tooltip>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">{labels.popover}</Button>
            </PopoverTrigger>
            <PopoverContent className="text-small">{labels.popoverBody}</PopoverContent>
          </Popover>
          <Button
            variant="secondary"
            onClick={() => toast({ title: labels.saved, description: labels.savedBody, variant: "success" })}
          >
            {labels.showToast}
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: labels.failed, variant: "destructive" })}>
            {labels.showError}
          </Button>
        </div>
        <Tabs defaultValue="one" className="max-w-xl">
          <TabsList>
            <TabsTrigger value="one">{labels.tabOne}</TabsTrigger>
            <TabsTrigger value="two">{labels.tabTwo}</TabsTrigger>
          </TabsList>
          <TabsContent value="one">{labels.tabOneBody}</TabsContent>
          <TabsContent value="two">{labels.tabTwoBody}</TabsContent>
        </Tabs>
        <Accordion type="single" collapsible className="max-w-xl">
          <AccordionItem value="faq">
            <AccordionTrigger>{labels.faq}</AccordionTrigger>
            <AccordionContent>{labels.faqBody}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
      <Toaster closeLabel={labels.close} toastLabel={labels.notification} regionLabel={labels.notifications} />
    </TooltipProvider>
  );
}
