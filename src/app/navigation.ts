import {
  BookOpen,
  GraduationCap,
  House,
  School,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../features/auth/SessionProvider';
import { administrativeRoles } from '../../shared/roles';
export type NavigationItem = { key: string; to: string; icon: LucideIcon; roles: readonly Role[] };
const all: Role[] = ['system_admin', 'organization_admin', 'teacher', 'read_only'];
export const organizationPilotRoles: Role[] = ['organization_admin'];
export const educatorPilotRoles: Role[] = ['organization_admin', 'teacher'];
export const navigation: NavigationItem[] = [
  { key: 'dashboard', to: '/app', icon: House, roles: all },
  { key: 'students', to: '/app/students', icon: GraduationCap, roles: educatorPilotRoles },
  { key: 'teachers', to: '/app/teachers', icon: Users, roles: administrativeRoles },
  { key: 'classes', to: '/app/classes', icon: School, roles: educatorPilotRoles },
  { key: 'program', to: '/app/program', icon: BookOpen, roles: organizationPilotRoles },
  { key: 'families', to: '/app/families', icon: UsersRound, roles: organizationPilotRoles },
  { key: 'settings', to: '/app/settings', icon: Settings, roles: administrativeRoles },
];
export const visibleNavigation = (role: Role) =>
  navigation.filter((item) => item.roles.includes(role));
export const previewDestination = (key: string) => `/ui-preview/${key}`;
