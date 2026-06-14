import { useParams } from "react-router-dom";
import { ChatRoom } from "../components/ChatRoom";

/**
 * Chat refund per order. Hanya bisa diakses bila user sudah mengajukan refund
 * (chat dibuat oleh /account/refund-request). Kalau chat belum ada / sudah
 * dihapus cron, ChatRoom menampilkan state kosong dan user mengelola dari
 * halaman detail pesanan.
 */
export default function SupportChatPage() {
  const { idOrCode } = useParams();
  return (
    <ChatRoom
      loadPath={`/support/orders/${idOrCode}`}
      sendPath={`/support/orders/${idOrCode}/send`}
      backTo={`/akun/pesanan/${idOrCode}`}
      title={`Refund · ${idOrCode}`}
      subtitle="Admin akan menindaklanjuti permintaan refund kamu"
      emptyTitle="Belum ada percakapan refund"
      emptyHint="Ajukan refund dari halaman detail pesanan untuk memulai percakapan dengan admin."
    />
  );
}
