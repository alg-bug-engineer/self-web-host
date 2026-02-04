import ChatInterface from "@/components/ChatInterface";

export default function ChatPage() {
    // This page needs to fill the entire screen, so we remove padding from the main layout.
    // We achieve this by adding a class to the html/body element in layout.tsx,
    // but for now, we'll just render the component. The parent layout will determine the final size.
    // For a true full-screen experience, the layout component might need adjustments.
    return (
        <div className="h-[calc(100vh-var(--header-height))]">
           <ChatInterface />
        </div>
    );
}
