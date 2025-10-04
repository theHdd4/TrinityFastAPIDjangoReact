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
        
        // First, try to find the atom search input
        let atomSearchInput = document.querySelector('input[data-atom-search="true"]') as HTMLInputElement;
        
        if (atomSearchInput) {
          // If found, focus it
          atomSearchInput.focus();
          atomSearchInput.select();
          console.log('Atom search input focused');
        } else {
          // If not found, try to open the atom list sidebar first
          console.log('Atom search input not found, trying to open atom list sidebar...');
          
          // Look for the atom list sidebar toggle button
          const atomSidebarToggle = document.querySelector('[data-lab-sidebar] button[data-atom-sidebar-toggle="true"]') as HTMLButtonElement;
          
          if (atomSidebarToggle) {
            console.log('Found atom sidebar toggle button, clicking it...');
            atomSidebarToggle.click();
            
            // Wait a bit for the sidebar to open, then try to focus the search input
            setTimeout(() => {
              const searchInput = document.querySelector('input[data-atom-search="true"]') as HTMLInputElement;
              if (searchInput) {
                searchInput.focus();
                searchInput.select();
                console.log('Atom search input focused after opening sidebar');
              } else {
                console.log('Still could not find atom search input after opening sidebar');
              }
            }, 100);
          } else {
            console.log('Could not find atom sidebar toggle button');
            // Fallback: try other selectors
            atomSearchInput = document.querySelector('input[placeholder*="Search atoms..."]') as HTMLInputElement;
            if (atomSearchInput) {
              atomSearchInput.focus();
              atomSearchInput.select();
            }
          }
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
        
        // Try to find the saved dataframes button in the auxiliary menu
        // Look for the Database icon button in the auxiliary menu
        let dataframesButton = document.querySelector('[data-lab-settings] button[data-saved-dataframes="true"]') as HTMLButtonElement;
        
        if (!dataframesButton) {
          // Try finding by looking for Database icon in the auxiliary menu area
          const auxiliaryMenu = document.querySelector('[data-lab-settings]');
          if (auxiliaryMenu) {
            const databaseIcon = auxiliaryMenu.querySelector('svg[data-lucide="database"]') as SVGElement;
            if (databaseIcon) {
              dataframesButton = databaseIcon.closest('button') as HTMLButtonElement;
            }
          }
        }
        
        if (!dataframesButton) {
          // Try finding by the Database icon in any button
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            const icon = button.querySelector('svg[data-lucide="database"]');
            if (icon) {
              dataframesButton = button as HTMLButtonElement;
              break;
            }
          }
        }
        
        if (!dataframesButton) {
          // Try finding by text content that includes "Database" or "Saved DataFrames"
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            if (button.textContent?.includes('Database') || button.textContent?.includes('Saved DataFrames')) {
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
          // Debug: log all buttons in the auxiliary menu area
          const auxiliaryMenu = document.querySelector('[data-lab-settings]');
          if (auxiliaryMenu) {
            const buttons = auxiliaryMenu.querySelectorAll('button');
            console.log('Available buttons in auxiliary menu:', buttons.length);
            buttons.forEach((btn, index) => {
              console.log(`Button ${index}:`, btn.title, btn.textContent, btn);
            });
          }
        }
      }
      
      // Check for Ctrl+P (or Cmd+P on Mac) for properties/settings
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
        
        console.log('Ctrl+P pressed, looking for settings button...');
        
        // Try to find the settings button in the auxiliary menu
        // Look for the Settings icon button in the auxiliary menu
        let settingsButton = document.querySelector('[data-lab-settings] button[data-settings="true"]') as HTMLButtonElement;
        
        if (!settingsButton) {
          // Try finding by looking for Settings icon in the auxiliary menu area
          const auxiliaryMenu = document.querySelector('[data-lab-settings]');
          if (auxiliaryMenu) {
            const settingsIcon = auxiliaryMenu.querySelector('svg[data-lucide="settings"]') as SVGElement;
            if (settingsIcon) {
              settingsButton = settingsIcon.closest('button') as HTMLButtonElement;
            }
          }
        }
        
        if (!settingsButton) {
          // Try finding by the Settings icon in any button
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            const icon = button.querySelector('svg[data-lucide="settings"]');
            if (icon) {
              settingsButton = button as HTMLButtonElement;
              break;
            }
          }
        }
        
        if (!settingsButton) {
          // Try finding by text content that includes "Settings" or "Properties"
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            if (button.textContent?.includes('Settings') || button.textContent?.includes('Properties')) {
              settingsButton = button as HTMLButtonElement;
              break;
            }
          }
        }
        
        console.log('Settings button found:', !!settingsButton);
        if (settingsButton && !settingsButton.disabled) {
          settingsButton.click();
          console.log('Settings button clicked');
        } else {
          console.log('Settings button not found or disabled');
          // Debug: log all buttons in the auxiliary menu area
          const auxiliaryMenu = document.querySelector('[data-lab-settings]');
          if (auxiliaryMenu) {
            const buttons = auxiliaryMenu.querySelectorAll('button');
            console.log('Available buttons in auxiliary menu:', buttons.length);
            buttons.forEach((btn, index) => {
              console.log(`Button ${index}:`, btn.title, btn.textContent, btn);
            });
          }
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