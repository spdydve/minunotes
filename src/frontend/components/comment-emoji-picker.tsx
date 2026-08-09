import EmojiPicker, { type EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';

export default function CommentEmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const colorScheme = getComputedStyle(document.documentElement).colorScheme;

  return (
    <EmojiPicker
      width="100%"
      height={340}
      theme={colorScheme === 'dark' ? Theme.DARK : Theme.LIGHT}
      emojiStyle={EmojiStyle.NATIVE}
      lazyLoadEmojis
      autoFocusSearch
      searchPlaceHolder="Search emoji"
      previewConfig={{ showPreview: false }}
      onEmojiClick={(emoji: EmojiClickData) => onSelect(emoji.emoji)}
    />
  );
}
