"use client";

import { signIn } from "next-auth/react";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { GoogleIcon, DiscordIcon } from "@/components/icons/provider-icons";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-sm">
      <ResponsiveDialogHeader className="flex flex-col gap-2">
        <ResponsiveDialogTitle>Sign in to continue</ResponsiveDialogTitle>
          <p className="text-xs text-muted-foreground">Choose a provider to access your account</p>
      </ResponsiveDialogHeader>
      <div className="flex flex-col gap-3 pt-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-3"
          onClick={() => signIn("google")}
        >
          <GoogleIcon className="size-4 shrink-0" />
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3"
          onClick={() => signIn("discord")}
        >
          <DiscordIcon className="size-4 shrink-0" />
          Continue with Discord
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
