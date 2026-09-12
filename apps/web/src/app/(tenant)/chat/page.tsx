import { requireSession } from '@/lib/session';
import ChatView from '@/components/chat/ChatView';

/**
 * §27 chat page — session-gated by the (tenant) layout; the owner side shares
 * this surface (conversation API is participant-based). viewerId rides as a
 * prop so the client tree never re-fetches /users/me.
 */
export default async function ChatPage() {
  const session = await requireSession();
  return <ChatView viewerId={session.id} />;
}
