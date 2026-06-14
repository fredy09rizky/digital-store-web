import { ChatRoom } from "../components/ChatRoom";

/**
 * Chat support umum (level akun, tidak terikat order). User bisa bertanya
 * apa saja ke admin. Satu chat aktif per user; setelah ditutup & dihapus
 * otomatis oleh sistem, user bisa memulai percakapan baru.
 */
export default function SupportGeneralPage() {
  return (
    <ChatRoom
      loadPath="/support/general"
      sendPath="/support/general/send"
      backTo="/akun"
      title="Bantuan & Support"
      subtitle="Admin akan membalas secepatnya"
      emptyTitle="Mulai percakapan dengan admin"
      emptyHint="Tanyakan apa saja seputar produk, pesanan, atau kendala lainnya. Tulis pesan di bawah."
    />
  );
}
