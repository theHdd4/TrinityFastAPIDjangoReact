import { MERGE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';

export const mergeHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages } = context;
    
    if (!data.merge_json) {
      return { success: false };
    }

    const cfg = data.merge_json;
    const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
    const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
    const joinColumns = Array.isArray(cfg.join_columns) ? cfg.join_columns : [];
    const joinType = cfg.join_type || 'inner';
    
    console.log('🤖 AI MERGE CONFIG EXTRACTED:', { file1, file2, joinColumns, joinType });
    
    // Update atom settings
    updateAtomSettings(atomId, { 
      file1, 
      file2, 
      joinColumns, 
      joinType, 
      availableColumns: joinColumns,
      aiConfig: cfg,
      aiMessage: data.message
    });
    
    // Add AI success message
    const aiSuccessMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: `✅ ${data.message || 'AI merge configuration completed'}\n\nFiles: ${file1} + ${file2}\nJoin Type: ${joinType}\nJoin Columns: ${joinColumns.join(', ')}\n\n🔄 Operation completed! You can now configure the merge or proceed with the current settings.`,
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiSuccessMsg]);
    
    // Auto-execute merge operation
    try {
      const performEndpoint = `${MERGE_API}/perform`;
      console.log('🚀 Calling merge perform endpoint with AI config:', { file1, file2, joinColumns, joinType });
      
      const getFilename = (filePath: string) => {
        if (!filePath) return "";
        return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
      };
      
      const lowercaseJoinColumns = joinColumns.map((col: string) => col.toLowerCase());
      
      const formData = new URLSearchParams({
        file1: getFilename(file1),
        file2: getFilename(file2),
        bucket_name: cfg.bucket_name || 'trinity',
        join_columns: JSON.stringify(lowercaseJoinColumns),
        join_type: joinType,
      });
      
      console.log('📁 Sending filenames to merge backend:', { 
        file1: getFilename(file1), 
        file2: getFilename(file2),
        bucket_name: cfg.bucket_name || 'trinity',
        join_columns: JSON.stringify(lowercaseJoinColumns),
        join_type: joinType
      });
      
      const res2 = await fetch(performEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Merge operation successful:', result);
        
        updateAtomSettings(atomId, {
          file1,
          file2,
          joinColumns,
          joinType,
          availableColumns: joinColumns,
          mergeResults: {
            ...result,
            result_file: null,
            unsaved_data: result.data,
          },
          operationCompleted: true
        });
        
        const completionMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `🎉 Merge operation completed successfully!\n\nResult ID: ${result.merge_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, completionMsg]);
        
      } else {
        console.error('❌ Merge operation failed:', res2.status, res2.statusText);
        
        let errorDetail = res2.statusText;
        try {
          const errorData = await res2.json();
          errorDetail = errorData.detail || errorData.message || res2.statusText;
        } catch (e) {
          // Use status text if can't parse error response
        }
        
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `❌ Merge operation failed: ${res2.status}\n\nError: ${errorDetail}\n\nFiles: ${file1} + ${file2}\nJoin Columns: ${joinColumns.join(', ')}\nJoin Type: ${joinType}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          file1,
          file2,
          joinColumns,
          joinType,
          availableColumns: joinColumns,
          operationCompleted: false
        });
      }
    } catch (error) {
      console.error('❌ Error calling merge perform endpoint:', error);
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
        joinColumns,
        joinType,
        availableColumns: joinColumns,
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
        if (data.file_analysis.merge_tips && data.file_analysis.merge_tips.length > 0) {
          aiText += `• Tips: ${data.file_analysis.merge_tips.join(', ')}\n`;
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
