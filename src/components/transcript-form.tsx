"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  studentName: z.string().min(2, "Student name must be at least 2 characters."),
  transcript: z.string().min(50, "Transcript must be at least 50 characters."),
  gender: z.enum(["male", "female"], {
    required_error: "You need to select a gender.",
  }),
});

export function TranscriptForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      studentName: "",
      transcript: "",
      gender: "male",
    },
  });

  function downloadBase64Docx(base64: string, filename: string) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "output.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    setGeneratedReport(null);

    try {
      // 1) Call /api/generate -> returns the answers JSON (your "Parsed Gemini JSON Response")
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to generate report.");
      }
      const answers = await genRes.json(); // this is the exact object to feed into /api/fill-doc
      setGeneratedReport(answers);

      toast({ title: "Report generated", description: "Creating your DOCX…" });

      // 2) Call /api/fill-doc with { studentName, answers } (NO disk read, no fallback)
      const fillRes = await fetch("/api/fill-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: values.studentName,
          answers, // pass through the generated JSON
        }),
      });
      if (!fillRes.ok) {
        const err = await fillRes.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to fill DOCX.");
      }
      const fillData = await fillRes.json(); // { ok, filename, base64Docx }
      if (!fillData?.ok || !fillData?.base64Docx) {
        throw new Error("Fill-doc response missing base64Docx.");
      }

      // 3) Download the fresh DOCX
      downloadBase64Docx(fillData.base64Docx, fillData.filename);

      toast({
        title: "Done",
        description: `${fillData.filename} generated and downloaded.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full shadow-lg border-2 border-transparent hover:border-primary/20 transition-all duration-300">
      <CardHeader>
        <CardTitle className="font-headline text-2xl">Enter Student Details</CardTitle>
        <CardDescription>
          Generates JSON with /api/generate, then fills the DOCX using those values and downloads it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="studentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-headline">Student Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="font-headline">Gender</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex items-center space-x-6 pt-2"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="male" />
                          </FormControl>
                          <FormLabel className="font-normal font-body">Male</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="female" />
                          </FormControl>
                          <FormLabel className="font-normal font-body">Female</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="transcript"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Transcript</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Paste the full student transcript here..."
                      className="min-h-[420px] resize-y font-body"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full md:w-auto bg-accent text-accent-foreground hover:bg-accent/90"
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating & Filling…
                  </>
                ) : (
                  <>Generate & Download</>
                )}
              </Button>
            </div>
          </form>
        </Form>

        {generatedReport && (
          <div className="mt-8 p-6 bg-gray-100 rounded-lg shadow-inner">
            <h3 className="font-headline text-xl mb-4">Generated Report (JSON)</h3>
            <pre className="bg-gray-50 p-4 rounded-md overflow-auto text-sm">
              <code>{JSON.stringify(generatedReport, null, 2)}</code>
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
