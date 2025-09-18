import { CONCAT_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';

export const concatHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages } = context;
    
    if (!data.concat_json) {
      return { success: false };
    }

    const cfg = data.concat_json;
    const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
    const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
    const direction = cfg.concat_direction || 'vertical';
    
    console.log('🤖 AI CONCAT CONFIG EXTRACTED:', { file1, file2, direction });
    
    // Update atom settings with the AI configuration
    updateAtomSettings(atomId, { 
      file1, 
      file2, 
      direction,
      aiConfig: cfg,
      aiMessage: data.message
    });
    
    // Add AI success message
    const aiSuccessMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: `✅ ${data.message || 'AI configuration completed'}\n\nFiles: ${file1} + ${file2}\nDirection: ${direction}\n\n🔄 Operation completed! You can now configure the concatenation or proceed with the current settings.`,
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiSuccessMsg]);
    
    // Automatically call perform endpoint
    try {
      const performEndpoint = `${CONCAT_API}/perform`;
      console.log('🚀 Calling perform endpoint with AI config:', { file1, file2, direction });
      
      const getFilename = (filePath: string) => {
        if (!filePath) return "";
        return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
      };
      
      const payload = {
        file1: getFilename(file1),
        file2: getFilename(file2),
        concat_direction: direction,
      };
      
      console.log('📁 Sending filenames to backend:', payload);
      
      const res2 = await fetch(performEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Perform operation successful:', result);
        
        updateAtomSettings(atomId, {
          file1,
          file2,
          direction,
          concatResults: result,
          concatId: result.concat_id,
          operationCompleted: true
        });
        
        const completionMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `🎉 Operation completed successfully!\n\nResult ID: ${result.concat_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, completionMsg]);
        
      } else {
        console.error('❌ Perform operation failed:', res2.status, res2.statusText);
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `❌ Operation failed: ${res2.status} ${res2.statusText}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          file1,
          file2,
          direction,
          operationCompleted: false
        });
      }
    } catch (error) {
      console.error('❌ Error calling perform endpoint:', error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error: ${(error as Error).message || 'Unknown error occurred'}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      
      updateAtomSettings(atomId, {
        file1,
        file2,
        direction,
        operationCompleted: false
      });
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages } = context;
    
    let aiText = '';
    if (data.smart_response) {
      aiText = data.smart_response;
    } else if (data.suggestions && Array.isArray(data.suggestions)) {
      aiText = `${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
      
      if (data.file_analysis) {
        aiText += `\n\n📊 File Analysis:\n`;
        if (data.file_analysis.total_files) {
          aiText += `• Total files available: ${data.file_analysis.total_files}\n`;
        }
        if (data.file_analysis.concat_tips && data.file_analysis.concat_tips.length > 0) {
          aiText += `• Tips: ${data.file_analysis.concat_tips.join(', ')}\n`;
        }
      }
      
      if (data.next_steps && data.next_steps.length > 0) {
        aiText += `\n\n🎯 Next Steps:\n${data.next_steps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n')}`;
      }
    } else {
      aiText = data.smart_response || data.message || 'AI response received';
    }
    
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: aiText,
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    
    return { success: true };
  }
};
