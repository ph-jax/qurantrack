import {
  BookOpen,
  CalendarCheck,
  GraduationCap,
  LayoutGrid,
  School,
  Settings,
  Users,
  UsersRound,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../features/auth/SessionProvider';
import { administrativeRoles } from '../../shared/roles';
export type NavigationGroup = 'daily' | 'administration';
export type NavigationItem = {
  key: string;
  to: string;
  icon: LucideIcon;
  roles: readonly Role[];
  group: NavigationGroup;
  primary?: boolean;
};
const all: Role[] = ['system_admin', 'organization_admin', 'teacher', 'read_only'];
export const organizationPilotRoles: Role[] = ['organization_admin'];
export const educatorPilotRoles: Role[] = ['organization_admin', 'teacher'];
export const navigation: NavigationItem[] = [
  {
    key: 'dashboard',
    to: '/app',
    icon: CalendarCheck,
    roles: all,
    group: 'daily',
    primary: true,
  },
  {
    key: 'classes',
    to: '/app/classes',
    icon: School,
    roles: educatorPilotRoles,
    group: 'daily',
    primary: true,
  },
  {
    key: 'students',
    to: '/app/students',
    icon: GraduationCap,
    roles: educatorPilotRoles,
    group: 'daily',
    primary: true,
  },
  {
    key: 'manage',
    to: '/app/manage',
    icon: LayoutGrid,
    roles: administrativeRoles,
    group: 'administration',
    primary: true,
  },
  {
    key: 'teachers',
    to: '/app/teachers',
    icon: Users,
    roles: administrativeRoles,
    group: 'administration',
  },
  {
    key: 'program',
    to: '/app/program',
    icon: BookOpen,
    roles: organizationPilotRoles,
    group: 'administration',
  },
  {
    key: 'families',
    to: '/app/families',
    icon: UsersRound,
    roles: organizationPilotRoles,
    group: 'administration',
  },
  {
    key: 'notifications',
    to: '/app/notifications',
    icon: Bell,
    roles: organizationPilotRoles,
    group: 'administration',
  },
  {
    key: 'settings',
    to: '/app/settings',
    icon: Settings,
    roles: administrativeRoles,
    group: 'administration',
  },
];
export const visibleNavigation = (role: Role) =>
  navigation.filter((item) => item.roles.includes(role));
export const primaryNavigation = (role: Role) =>
  visibleNavigation(role).filter((item) => item.primary);
export const previewDestination = (key: string) => `/ui-preview/${key}`;
