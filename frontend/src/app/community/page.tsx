"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";
import CommunityGallery from "@/components/community/CommunityGallery";

export default function CommunityPage() {
  return (
    <AuthGuard>
      <CommunityGallery />
    </AuthGuard>
  );
}
