export function Toast({ message, kind = "success", onClose }: { message: string; kind?: "success" | "error"; onClose: () => void }) {
  return <div className={`toast ${kind}`} role="status"><strong>{kind === "success" ? "Success" : "Error"}</strong><span>{message}</span><button onClick={onClose}>×</button></div>;
}
