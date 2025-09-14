import React, { useState, ChangeEvent } from 'react';

export type CardEntryProps = {
  // Optional controlled value. If provided, internal state acts as a mirror.
  value?: string;
  // Callback when the text changes.
  onChange?: (id: number, value: string) => void;
  // Callback when this is focused
  onFocus?: (id: number) => void;
  // when the user presses enter
  onSubmit?: (id: number) => void;
  // when the user presses backspace when it is already empty
  onErase?: (id: number) => void;
  // Callback for when the user pastes something. We need to process it
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  // Optional placeholder text.
  placeholder?: string;
  // Optional className to allow further styling from parent if needed.
  className?: string;
  // Optional input name/id for forms & accessibility.
  name?: string;
  id: number;
  // Autofocus toggle.
  autoFocus?: boolean;
  // Optional ref callback provided by parent for focus control
  inputRef?: (el: HTMLInputElement | null) => void;
};

const CardEntry: React.FC<CardEntryProps> = ({
  value,
  onChange,
  onSubmit,
  onFocus,
  onPaste,
  onErase,
  placeholder = 'Enter card name',
  className,
  name,
  id,
  autoFocus,
  inputRef,
}) => {
  // Internal state for entered text. If `value` prop is provided, we mirror it.
  const [internalValue, setInternalValue] = useState<string>(value ?? '');

  React.useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (value === undefined) setInternalValue(next);
    onChange?.(id, next);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log(e.key, internalValue);
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.(id);
    } else if (e.key === 'Backspace' && (internalValue === '' || internalValue === undefined || internalValue === null)) {
      e.preventDefault();
      onErase?.(id);
    }
  };
  
  return (
    <input
      type="text"
      name={name}
  id={`card-entry-${id}`}
  ref={inputRef}
      value={internalValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
  onPaste={onPaste}
      placeholder={placeholder}
      style={{ width: '100%', height: 32, fontSize: 24, lineHeight: '32px' }}
      className={className}
      autoComplete="off"
      autoFocus={autoFocus}
    />
  )
};

export default CardEntry;
