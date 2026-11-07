"use client";

import { EditorProvider } from "./editor-session";
import { Workspace } from "./components/Workspace";

export default function Home() { return <EditorProvider><Workspace /></EditorProvider>; }
