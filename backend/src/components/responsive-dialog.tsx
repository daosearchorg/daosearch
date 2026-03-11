"use client";

import * as React from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

const ResponsiveContext = React.createContext(true);

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function ResponsiveDialog({ open, onOpenChange, children, className }: ResponsiveDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return (
      <ResponsiveContext.Provider value={true}>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className={className}>{children}</DialogContent>
        </Dialog>
      </ResponsiveContext.Provider>
    );
  }

  return (
    <ResponsiveContext.Provider value={false}>
      <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <DrawerContent>
          <div className="px-4 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    </ResponsiveContext.Provider>
  );
}

type HeaderProps = React.ComponentProps<typeof DialogHeader>;
type TitleProps = React.ComponentProps<typeof DialogTitle>;
type DescriptionProps = React.ComponentProps<typeof DialogDescription>;

function ResponsiveDialogHeader({ className, ...props }: HeaderProps) {
  const isDesktop = React.useContext(ResponsiveContext);
  if (isDesktop) return <DialogHeader className={className} {...props} />;
  return <DrawerHeader className={className} {...props} />;
}

function ResponsiveDialogTitle({ className, ...props }: TitleProps) {
  const isDesktop = React.useContext(ResponsiveContext);
  if (isDesktop) return <DialogTitle className={className} {...props} />;
  return <DrawerTitle className={className} {...props} />;
}

function ResponsiveDialogDescription({ className, ...props }: DescriptionProps) {
  const isDesktop = React.useContext(ResponsiveContext);
  if (isDesktop) return <DialogDescription className={className} {...props} />;
  return <DrawerDescription className={className} {...props} />;
}

export {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
};
