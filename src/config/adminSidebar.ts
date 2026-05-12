import {
  Users,
  BookOpen,
  Video,
  FileText,
  CreditCard,
  LayoutDashboard,
  Settings,
  ClipboardList,
  GraduationCap,
} from "lucide-react"

export const adminSidebarLinks = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard/admin",
  },

  {
    label: "Students",
    icon: Users,
    path: "/dashboard/students",
  },

  {
    label: "Teachers",
    icon: GraduationCap,
    path: "/dashboard/teachers",
  },

  {
    label: "Classes",
    icon: BookOpen,
    path: "/dashboard/classes",
  },

  /* ================= CBT ================= */
  {
    label: "CBT Exams",
    icon: ClipboardList,
    path: "/dashboard/admin/cbt",
  },

  {
    label: "Results",
    icon: FileText,
    path: "/dashboard/results",
  },

  /* ================= ZOOM ================= */
  {
    label: "Zoom Manager",
    icon: Video,
    path: "/dashboard/admin/zoom",
  },

  /* ================= FEES ================= */
  {
    label: "Fees",
    icon: CreditCard,
    path: "/dashboard/fees",
  },

  {
    label: "Invoices",
    icon: FileText,
    path: "/dashboard/billing",
  },

  /* ================= SETTINGS ================= */
  {
    label: "Settings",
    icon: Settings,
    path: "/dashboard/settings",
  },
]