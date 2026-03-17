import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
  "bg-lime-500", "bg-green-500", "bg-emerald-500", "bg-teal-500",
  "bg-cyan-500", "bg-sky-500", "bg-blue-500", "bg-indigo-500",
  "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

interface UserAvatarProps {
  username: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({ username, avatarUrl, className, fallbackClassName }: UserAvatarProps) {
  const colorClass = COLORS[hashCode(username) % COLORS.length];

  return (
    <Avatar className={cn("size-6", className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
      <AvatarFallback className={cn(colorClass, "text-white", fallbackClassName)}>
        {getInitials(username)}
      </AvatarFallback>
    </Avatar>
  );
}
