import { useEffect, useRef } from 'react';

export const useSearchShortcut = () => {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Q (or Cmd+Q on Mac)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'q') {
        // Don't trigger if user is typing in an input field
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.getAttribute('role') === 'textbox'
        ) {
          return;
        }

        event.preventDefault();
        
        console.log('Ctrl+Q pressed, focusing atom search...');
        
        // Single Q: Focus atom list search bar
        // Try data attribute first
        let atomSearchInput = document.querySelector('input[data-atom-search="true"]') as HTMLInputElement;
        
        if (!atomSearchInput) {
          // Try multiple selectors for the atom search
          atomSearchInput = document.querySelector('input[placeholder*="Search atoms..."]') as HTMLInputElement;
        }
        if (!atomSearchInput) {
          atomSearchInput = document.querySelector('input[placeholder*="Search atoms"]') as HTMLInputElement;
        }
        if (!atomSearchInput) {
          // Try finding by the search icon or container
          const searchContainer = document.querySelector('[data-lab-sidebar] input') as HTMLInputElement;
          if (searchContainer) {
            atomSearchInput = searchContainer;
          }
        }
        
        console.log('Atom search input found:', !!atomSearchInput);
        if (atomSearchInput) {
          atomSearchInput.focus();
          atomSearchInput.select();
        } else {
          console.log('Could not find atom search input, trying all inputs...');
          const allInputs = document.querySelectorAll('input[type="text"]');
          console.log('All text inputs found:', allInputs.length);
          allInputs.forEach((input, index) => {
            console.log(`Input ${index}:`, input.placeholder, input);
          });
        }
      }
      
      // Check for Ctrl+S (or Cmd+S on Mac) for save
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        // Don't trigger if user is typing in an input field
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.getAttribute('role') === 'textbox'
        ) {
          return;
        }

        event.preventDefault();
        
        console.log('Ctrl+S pressed, looking for save button...');
        
        // Try data attribute first
        let saveButton = document.querySelector('button[data-lab-save="true"]') as HTMLButtonElement;
        
        if (!saveButton) {
          // Try finding by text content
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            if (button.textContent?.includes('Save')) {
              saveButton = button as HTMLButtonElement;
              break;
            }
          }
        }
        
        console.log('Save button found:', !!saveButton);
        if (saveButton && !saveButton.disabled) {
          saveButton.click();
          console.log('Save button clicked');
        } else {
          console.log('Save button not found or disabled');
        }
      }
      
      // Check for Ctrl+D (or Cmd+D on Mac) for saved dataframe
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        // Don't trigger if user is typing in an input field
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.getAttribute('role') === 'textbox'
        ) {
          return;
        }

        event.preventDefault();
        
        console.log('Ctrl+D pressed, looking for saved dataframe button...');
        
        // Try to find and click the saved dataframes button
        let dataframesButton = document.querySelector('button[data-saved-dataframes="true"]') as HTMLButtonElement;
        
        if (!dataframesButton) {
          // Try finding by Database icon or title
          dataframesButton = document.querySelector('button[title*="Saved DataFrames"]') as HTMLButtonElement;
        }
        
        if (!dataframesButton) {
          // Try finding by the Database icon
          const databaseButtons = document.querySelectorAll('button');
          for (const button of databaseButtons) {
            const icon = button.querySelector('svg');
            if (icon && button.textContent?.includes('Database')) {
              dataframesButton = button as HTMLButtonElement;
              break;
            }
          }
        }
        
        console.log('Saved DataFrames button found:', !!dataframesButton);
        if (dataframesButton && !dataframesButton.disabled) {
          dataframesButton.click();
          console.log('Saved DataFrames button clicked');
        } else {
          console.log('Saved DataFrames button not found or disabled');
        }
      }
      
      // Check for Ctrl+P (or Cmd+P on Mac) for properties
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        // Don't trigger if user is typing in an input field
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.getAttribute('role') === 'textbox'
        ) {
          return;
        }

        event.preventDefault();
        
        console.log('Ctrl+P pressed, looking for properties...');
        
        // Try to find and click the properties/settings button
        let propertiesButton = document.querySelector('button[data-lab-settings]') as HTMLButtonElement;
        
        if (!propertiesButton) {
          // Try finding by text content
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            if (button.textContent?.includes('Settings') || button.textContent?.includes('Properties')) {
              propertiesButton = button as HTMLButtonElement;
              break;
            }
          }
        }
        
        if (!propertiesButton) {
          // Try finding by title or aria-label
          propertiesButton = document.querySelector('button[title*="Settings"], button[title*="Properties"]') as HTMLButtonElement;
        }
        
        console.log('Properties button found:', !!propertiesButton);
        if (propertiesButton && !propertiesButton.disabled) {
          propertiesButton.click();
          console.log('Properties button clicked');
        } else {
          console.log('Properties button not found or disabled');
        }
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return { searchInputRef };
};

export default useSearchShortcut;