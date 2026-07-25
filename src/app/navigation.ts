import {
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  GraduationCap,
  House,
  School,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../features/auth/SessionProvider';
export type NavigationItem = { key: string; to: string; icon: LucideIcon; roles: Role[] };
const all: Role[] = ['system_admin', 'organization_admin', 'teacher', 'read_only'];
const admin: Role[] = ['system_admin', 'organization_admin'];
export const navigation: NavigationItem[] = [
  { key: 'dashboard', to: '/app', icon: House, roles: all },
  { key: 'students', to: '/app/students', icon: GraduationCap, roles: all },
  { key: 'teachers', to: '/app/teachers', icon: Users, roles: admin },
  { key: 'classes', to: '/app/classes', icon: School, roles: all },
  { key: 'program', to: '/app/program', icon: BookOpen, roles: admin },
  { key: 'reports', to: '/app/reports', icon: ChartNoAxesCombined, roles: all },
  { key: 'families', to: '/app/families', icon: UsersRound, roles: admin },
  { key: 'notifications', to: '/app/notifications', icon: Bell, roles: admin },
  { key: 'settings', to: '/app/settings', icon: Settings, roles: admin },
];
export const visibleNavigation = (role: Role) =>
  navigation.filter((item) => item.roles.includes(role));
export const previewDestination = (key: string) => `/ui-preview/${key}`;
