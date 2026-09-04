import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Bookmark,
  BookOpen,
  Bot,
  Building2,
  Clock,
  Compass,
  CreditCard,
  Database,
  DollarSign,
  Download,
  FileText,
  Film,
  GitPullRequest,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  Library,
  ListChecks,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Network,
  Package,
  PiggyBank,
  Plug,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Star,
  Tag,
  Trophy,
  Utensils,
  Zap,
} from 'lucide-react';

/**
 * Shared icon map — maps Lucide icon name strings to components.
 *
 * Lives beside `IconName` rather than in the shell because the shell is no
 * longer the only chrome that renders a navConfig: the design playground's
 * POPS web frame draws the same rail and page nav from the same configs, and
 * a second copy of this map is a second thing to forget an icon in.
 *
 * Add new icons here AND add the name to `IconName` in `./types.ts`.
 */
import type { IconName } from './types';

/**
 * Maps every IconName to its Lucide component. The `satisfies` clause
 * ensures that every member of the IconName union has a corresponding entry
 * and that all values are LucideIcon components — without widening the key
 * type to `string`.
 */
export const iconMap = {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Bookmark,
  BookOpen,
  Bot,
  Building2,
  Clock,
  Compass,
  CreditCard,
  Database,
  DollarSign,
  Download,
  FileText,
  Film,
  GitPullRequest,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  Library,
  ListChecks,
  MapPin,
  MessageSquare,
  Network,
  Package,
  PiggyBank,
  Plug,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Star,
  Tag,
  Trophy,
  Utensils,
  Zap,
} satisfies Record<IconName, LucideIcon>;
