import React, { useEffect } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Button } from './ui/button';
import { 
  Bold, Italic, Strikethrough, Underline as UnderlineIcon, 
  List, ListOrdered, Image as ImageIcon, Table as TableIcon,
  Type, Trash2, Plus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: '14px',
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, '') || '14px',
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .removeEmptyTextStyle()
          .run();
      },
    };
  },
});

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  onBlur?: () => void;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  const addImage = () => {
    const url = window.prompt('URL');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const setFontSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = e.target.value;
    if (size) {
      editor.chain().focus().setFontSize(size).run();
    } else {
      editor.chain().focus().unsetFontSize().run();
    }
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 items-center">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'bg-gray-200 dark:bg-gray-800' : ''}
      >
        <Bold className="h-4 w-4 dark:text-gray-200" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'bg-gray-200 dark:bg-gray-800' : ''}
      >
        <Italic className="h-4 w-4 dark:text-gray-200" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={editor.isActive('underline') ? 'bg-gray-200 dark:bg-gray-800' : ''}
      >
        <UnderlineIcon className="h-4 w-4 dark:text-gray-200" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? 'bg-gray-200 dark:bg-gray-800' : ''}
      >
        <Strikethrough className="h-4 w-4 dark:text-gray-200" />
      </Button>
      <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1 self-center" />
      
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().setParagraph().run()}
        className={editor.isActive('paragraph') ? 'bg-gray-200 dark:bg-gray-800' : ''}
        title="Normal Text"
      >
        <Type className="h-4 w-4 dark:text-gray-200" />
      </Button>
      
      <select 
        onChange={setFontSize} 
        className="text-sm border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-950 dark:text-gray-200 ml-1"
        defaultValue="14px"
      >
        <option value="12px">12px</option>
        <option value="14px">14px</option>
        <option value="16px">16px</option>
        <option value="18px">18px</option>
        <option value="24px">24px</option>
        <option value="30px">30px</option>
      </select>

      <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1 self-center" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? 'bg-gray-200 dark:bg-gray-800' : ''}
      >
        <List className="h-4 w-4 dark:text-gray-200" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? 'bg-gray-200 dark:bg-gray-800' : ''}
      >
        <ListOrdered className="h-4 w-4 dark:text-gray-200" />
      </Button>
      <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1 self-center" />
      <Button
        variant="ghost"
        size="sm"
        onClick={addImage}
      >
        <ImageIcon className="h-4 w-4 dark:text-gray-200" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insert Table"
      >
        <TableIcon className="h-4 w-4 dark:text-gray-200" />
      </Button>
      
      {editor.can().deleteTable() && (
        <>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1 self-center" />
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addRowBefore().run()} title="Add Row Above">
            <ArrowUp className="h-4 w-4 dark:text-gray-200" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addRowAfter().run()} title="Add Row Below">
            <ArrowDown className="h-4 w-4 dark:text-gray-200" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add Column Left">
            <ArrowLeft className="h-4 w-4 dark:text-gray-200" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add Column Right">
            <ArrowRight className="h-4 w-4 dark:text-gray-200" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row" className="text-red-500 hover:text-red-700">
            <Trash2 className="h-4 w-4" /> Row
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete Column" className="text-red-500 hover:text-red-700">
            <Trash2 className="h-4 w-4" /> Col
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().deleteTable().run()} title="Delete Table" className="text-red-500 hover:text-red-700">
            <Trash2 className="h-4 w-4" /> Table
          </Button>
        </>
      )}

      <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1 self-center" />
      <input
        type="color"
        onInput={event => editor.chain().focus().setColor((event.target as HTMLInputElement).value).run()}
        value={editor.getAttributes('textStyle').color || '#000000'}
        className="w-8 h-8 p-1 rounded cursor-pointer border-0 bg-transparent"
        title="Text Color"
      />
    </div>
  );
};

export function RichTextEditor({ content, onChange, placeholder, onBlur }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onBlur: () => {
      if (onBlur) onBlur();
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl dark:prose-invert mx-auto focus:outline-none p-4 min-h-[300px] max-w-none custom-tiptap-editor text-[14px]',
      },
      handlePaste: (view, event, slice) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        let hasImage = false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.indexOf('image') === 0) {
            hasImage = true;
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onload = (e) => {
                const result = e.target?.result as string;
                if (result) {
                  // Use the editor instance to insert the image
                  view.dispatch(
                    view.state.tr.replaceSelectionWith(
                      view.state.schema.nodes.image.create({ src: result })
                    )
                  );
                }
              };
              reader.readAsDataURL(file);
            }
          }
        }
        return hasImage; // If we handled an image, stop default paste
      },
    },
  });

  return (
    <div className="flex flex-col h-full w-full">
      <MenuBar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
