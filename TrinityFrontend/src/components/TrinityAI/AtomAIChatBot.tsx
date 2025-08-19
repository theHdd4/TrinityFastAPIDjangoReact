import React, { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Bot, User, X, MessageSquare, Send, Plus, RotateCcw } from 'lucide-react';
import { TRINITY_AI_API, CONCAT_API, MERGE_API, CREATECOLUMN_API, GROUPBY_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface AtomAIChatBotProps {
  atomId: string;
  atomType: string;
  atomTitle: string;
  className?: string;
  disabled?: boolean;
}

const ENDPOINTS: Record<string, string> = {
  concat: `${TRINITY_AI_API}/concat`,
  merge: `${TRINITY_AI_API}/merge`,
  'chart-maker': `${TRINITY_AI_API}/chart-maker`,
  'create-column': `${TRINITY_AI_API}/create-transform`,
  'groupby-wtg-avg': `${TRINITY_AI_API}/groupby`,
};

const PERFORM_ENDPOINTS: Record<string, string> = {
  merge: `${MERGE_API}/perform`,
  concat: `${CONCAT_API}/perform`,
  'create-column': `${CREATECOLUMN_API}/perform`,
  'groupby-wtg-avg': `${GROUPBY_API}/run`,
};

import { cn } from '@/lib/utils';

const AtomAIChatBot: React.FC<AtomAIChatBotProps> = ({ atomId, atomType, atomTitle, className, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => {
    // Generate session ID only once when component mounts
    const stored = localStorage.getItem(`trinity_ai_session_${atomId}`);
    if (stored) {
      return stored;
    }
    return Math.floor(1000 + Math.random() * 90000).toString();
  });
  
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load messages from localStorage if they exist
    const stored = localStorage.getItem(`trinity_ai_messages_${atomId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Ensure we have at least the initial message
        if (parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse stored messages:', e);
      }
    }
    // Return initial message with current session ID
    const initialSessionId = localStorage.getItem(`trinity_ai_session_${atomId}`) || Math.floor(1000 + Math.random() * 90000).toString();
    return [{
      id: 'init',
      content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.\n\n🆔 Session: ${initialSessionId}`,
      sender: 'ai',
      timestamp: new Date(),
    }];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`trinity_ai_messages_${atomId}`, JSON.stringify(messages));
  }, [messages, atomId]);

  // Session management functions
  const handleClearChat = () => {
    const clearedMessages = [
      {
        id: 'init',
        content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.\n\n🆔 Session: ${sessionId}\n💬 Chat history cleared`,
        sender: 'ai',
        timestamp: new Date(),
      },
    ];
    setMessages(clearedMessages);
    console.log('🧹 Chat history cleared for session:', sessionId);
  };

  const handleClearSession = () => {
    // Generate simple 4-5 digit session ID
    const newSessionId = Math.floor(1000 + Math.random() * 90000).toString();
    setSessionId(newSessionId);
    
    // Clear localStorage for old session
    localStorage.removeItem(`trinity_ai_session_${atomId}`);
    localStorage.removeItem(`trinity_ai_messages_${atomId}`);
    
    const newMessages = [
      {
        id: 'init',
        content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.\n\n🆔 Session: ${newSessionId}`,
        sender: 'ai',
        timestamp: new Date(),
      },
    ];
    setMessages(newMessages);
    
    // Store new session data
    localStorage.setItem(`trinity_ai_session_${atomId}`, newSessionId);
    localStorage.setItem(`trinity_ai_messages_${atomId}`, JSON.stringify(newMessages));
    
    console.log('🆕 New session created:', newSessionId);
  };

  // Initialize session ID only once on component mount
  useEffect(() => {
    // Store session ID in localStorage for persistence
    localStorage.setItem(`trinity_ai_session_${atomId}`, sessionId);
    console.log('🆔 Session initialized:', sessionId);
  }, [sessionId, atomId]);

  const handleSendMessage = async () => {
    const endpoint = ENDPOINTS[atomType];
    const performEndpoint = PERFORM_ENDPOINTS[atomType];
    if (!inputValue.trim() || !endpoint) return;

    const userMsg: Message = { id: Date.now().toString(), content: inputValue, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMsg.content,
          session_id: sessionId  // Include session ID for context
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Enhanced AI response handling with suggestions as master key
        let aiText = '';
        if (data.success) {
          // Success case - show completion message
          aiText = `✅ ${data.message || 'Operation completed successfully!'}\n\n🔄 You can now configure the operation or proceed with the current settings.`;
        } else if (Array.isArray(data.suggestions) && data.suggestions.length) {
          // Suggestions case - show enhanced suggestions
          aiText = `💡 ${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
          
          // Add file analysis if available
          if (data.file_analysis) {
            aiText += `\n\n📊 File Analysis:\n`;
            if (data.file_analysis.total_files) {
              aiText += `• Total files available: ${data.file_analysis.total_files}\n`;
            }
            if (data.file_analysis.recommended_pairs && data.file_analysis.recommended_pairs.length > 0) {
              aiText += `• Recommended pairs: ${data.file_analysis.recommended_pairs.join(', ')}\n`;
            }
            if (data.file_analysis.common_columns && data.file_analysis.common_columns.length > 0) {
              aiText += `• Common columns: ${data.file_analysis.common_columns.join(', ')}\n`;
            }
            if (data.file_analysis.concat_tips && data.file_analysis.concat_tips.length > 0) {
              aiText += `• Tips: ${data.file_analysis.concat_tips.join(', ')}\n`;
            }
            if (data.file_analysis.merge_tips && data.file_analysis.merge_tips.length > 0) {
              aiText += `• Tips: ${data.file_analysis.merge_tips.join(', ')}\n`;
            }
          }
          
          // Add next steps if available
          if (data.next_steps && data.next_steps.length > 0) {
            aiText += `\n\n🎯 Next Steps:\n${data.next_steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}`;
          }
        } else {
          // Fallback case
          aiText = data.message || data.response || data.final_response || 'AI response received';
        }
        
        const aiMsg: Message = { id: (Date.now() + 1).toString(), content: aiText, sender: 'ai', timestamp: new Date() };
        setMessages(prev => [...prev, aiMsg]);
        if (atomType === 'concat' && data.concat_json) {
          const cfg = data.concat_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const direction = cfg.concat_direction || 'vertical';
          
          console.log('🤖 AI CONFIG EXTRACTED:', { file1, file2, direction });
          
          // Update atom settings with the AI configuration
          updateAtomSettings(atomId, { 
            file1, 
            file2, 
            direction,
            // Store the full AI response for reference
            aiConfig: cfg,
            aiMessage: data.message
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI configuration completed'}\n\nFiles: ${file1} + ${file2}\nDirection: ${direction}\n\n🔄 Operation completed! You can now configure the concatenation or proceed with the current settings.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // Automatically call perform endpoint with AI configuration
          try {
            if (performEndpoint) {
              console.log('🚀 Calling perform endpoint with AI config:', { file1, file2, direction });
              
              // Extract just the filename if it's a full path
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
                
                // Update atom settings with results
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  direction,
                  concatResults: result,
                  concatId: result.concat_id,
                  operationCompleted: true
                });
                
                // Add completion message
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
            }
          } catch (error) {
            console.error('❌ Error calling perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}`,
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
        } else if (atomType === 'merge' && data.merge_json) {
          const cfg = data.merge_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const joinColumns = Array.isArray(cfg.join_columns)
            ? cfg.join_columns
            : [];
          const joinType = cfg.join_type || 'inner';
          
          console.log('🤖 AI MERGE CONFIG EXTRACTED:', { file1, file2, joinColumns, joinType });
          
          // Update atom settings with the AI configuration
          updateAtomSettings(atomId, { 
            file1, 
            file2, 
            joinColumns, 
            joinType, 
            availableColumns: joinColumns,
            // Store the full AI response for reference
            aiConfig: cfg,
            aiMessage: data.message
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI merge configuration completed'}\n\nFiles: ${file1} + ${file2}\nJoin Type: ${joinType}\nJoin Columns: ${joinColumns.join(', ')}\n\n🔄 Operation completed! You can now configure the merge or proceed with the current settings.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // Automatically call perform endpoint with AI configuration
          try {
            if (performEndpoint) {
              console.log('🚀 Calling merge perform endpoint with AI config:', { file1, file2, joinColumns, joinType });
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              // For merge, we need to send Form data (not JSON) and use just filenames
              // Backend will handle path resolution robustly
              // IMPORTANT: Convert join columns to lowercase to match backend expectation
              const lowercaseJoinColumns = joinColumns.map(col => col.toLowerCase());
              
              const formData = new URLSearchParams({
                file1: getFilename(file1),  // Extract filename from full path
                file2: getFilename(file2),  // Extract filename from full path
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
              
              console.log('🔄 Column case conversion:', {
                original: joinColumns,
                lowercase: lowercaseJoinColumns
              });
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ Merge operation successful:', result);
                
                // Update atom settings with results
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
                
                // Add completion message
                const completionMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `🎉 Merge operation completed successfully!\n\nResult ID: ${result.merge_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, completionMsg]);
                
              } else {
                console.error('❌ Merge operation failed:', res2.status, res2.statusText);
                
                // Try to get detailed error message from backend
                let errorDetail = res2.statusText;
                try {
                  const errorData = await res2.json();
                  errorDetail = errorData.detail || errorData.message || res2.statusText;
                } catch (e) {
                  // If we can't parse error response, use status text
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
            }
          } catch (error) {
            console.error('❌ Error calling merge perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}`,
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
        } else if (atomType === 'create-column' && data.create_transform_json) {
          const cfg = data.create_transform_json;
          
          console.log('🤖 AI CREATE COLUMN CONFIG EXTRACTED:', cfg);
          
          // Update atom settings with the AI configuration FIRST (like concat/merge)
          updateAtomSettings(atomId, { 
            aiConfig: cfg,
            aiMessage: data.message,
            operationCompleted: false
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI create column configuration completed'}\n\nFiles: ${cfg.file_name || 'N/A'}\nOperation: ${cfg.operations?.[0]?.type || 'N/A'}\n\n🔄 Executing create column operation...`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // Automatically call perform endpoint with AI configuration
          try {
            if (performEndpoint) {
              console.log('🚀 Calling create column perform endpoint with AI config:', cfg);
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              const formData = new URLSearchParams({
                object_names: getFilename(cfg.object_names || ''),
                bucket_name: cfg.bucket_name || 'trinity',
                identifiers: cfg.identifiers?.join(',') || '',
              });
              
              // Add operation fields that backend expects (add_0, add_1, etc.)
              if (cfg.operations && Array.isArray(cfg.operations)) {
                cfg.operations.forEach((op, index) => {
                  if (op.type && op.source_columns) {
                    formData.append(`${op.type}_${index}`, op.source_columns.join(','));
                    if (op.rename_to) {
                      formData.append(`${op.type}_${index}_rename`, op.rename_to);
                    }
                  }
                });
              }
              
              console.log('📁 Sending create column data to backend:', formData.toString());
              console.log('🔍 CREATE COLUMN CONFIG SENT TO BACKEND:', {
                endpoint: performEndpoint,
                config: cfg,
                formData: Object.fromEntries(formData.entries())
              });
              
              console.log('🚀 CALLING CREATE COLUMN BACKEND API:', performEndpoint);
              console.log('📤 Request details:', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
              });
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
              });
              
              console.log('📥 CREATE COLUMN BACKEND RESPONSE:', {
                status: res2.status,
                statusText: res2.statusText,
                ok: res2.ok,
                url: res2.url
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ Create column operation successful:', result);
                
                // Update atom settings with results
                updateAtomSettings(atomId, {
                  aiConfig: cfg,
                  aiMessage: data.message,
                  createResults: result,
                  operationCompleted: true
                });
                
                // Add completion message
                const completionMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `🎉 Create column operation completed successfully!\n\nStatus: ${result.status}\nMessage: ${result.message}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, completionMsg]);
                
              } else {
                console.error('❌ Create column operation failed:', res2.status, res2.statusText);
                
                let errorDetail = res2.statusText;
                try {
                  const errorData = await res2.json();
                  errorDetail = errorData.detail || errorData.message || res2.statusText;
                } catch (e) {
                  // If we can't parse error response, use status text
                }
                
                const errorMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `❌ Create column operation failed: ${res2.status}\n\nError: ${errorDetail}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
                
                updateAtomSettings(atomId, {
                  aiConfig: cfg,
                  aiMessage: data.message,
                  operationCompleted: false
                });
              }
            }
          } catch (error) {
            console.error('❌ Error calling create column perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            updateAtomSettings(atomId, {
              aiConfig: cfg,
              aiMessage: data.message,
              operationCompleted: false
            });
          }
          
        } else if (atomType === 'groupby-wtg-avg' && data.groupby_json) {
          const cfg = data.groupby_json;
          
          console.log('🤖 AI GROUPBY CONFIG EXTRACTED:', cfg);
          
          // 🔧 CRITICAL FIX: Automatically populate GroupBy settings with AI configuration
          const aiSelectedIdentifiers = cfg.identifiers || [];
          const aiSelectedMeasures = [];
          
          // 🔧 FIX: Ensure we have a single file, not multiple files
          let singleFileName = '';
          if (cfg.object_names) {
            // If object_names contains multiple files (comma-separated), take only the first one
            if (cfg.object_names.includes(',')) {
              singleFileName = cfg.object_names.split(',')[0].trim();
              console.log('🔧 Multiple files detected, using first file:', singleFileName);
            } else {
              singleFileName = cfg.object_names;
            }
          }
          
          // 🔧 FIX: Convert AI aggregations to selectedMeasures format with proper validation
          if (cfg.aggregations && typeof cfg.aggregations === 'object') {
            Object.entries(cfg.aggregations).forEach(([field, aggConfig]) => {
              if (typeof aggConfig === 'object' && aggConfig !== null) {
                const agg = (aggConfig as any).agg;
                if (agg) {
                  // 🔧 VALIDATION: Only allow numeric fields for aggregations
                  // This will be validated when the backend loads the actual data
                  aiSelectedMeasures.push({
                    field: field,
                    aggregator: agg === 'sum' ? 'Sum' : 
                                agg === 'mean' ? 'Mean' : 
                                agg === 'min' ? 'Min' : 
                                agg === 'max' ? 'Max' : 
                                agg === 'count' ? 'Count' : 
                                agg === 'median' ? 'Median' : 
                                agg === 'weighted_mean' ? 'Weighted Mean' : 
                                agg === 'rank_pct' ? 'Rank Percentile' : 'Sum',
                    weight_by: (aggConfig as any).weight_by || '',
                    rename_to: (aggConfig as any).rename_to || field
                  });
                }
              } else if (typeof aggConfig === 'string') {
                // Handle simple string aggregations
                aiSelectedMeasures.push({
                  field: field,
                  aggregator: aggConfig === 'sum' ? 'Sum' : 
                              aggConfig === 'mean' ? 'Mean' : 
                              aggConfig === 'min' ? 'Min' : 
                              aggConfig === 'max' ? 'Max' : 
                              aggConfig === 'count' ? 'Count' : 
                              aggConfig === 'median' ? 'Median' : 
                              aggConfig === 'weighted_mean' ? 'Weighted Mean' : 
                              aggConfig === 'rank_pct' ? 'Rank Percentile' : 'Sum',
                  weight_by: '',
                  rename_to: field
                });
              }
            });
          }
          
          // 🔧 FIX: If no aggregations specified, create sensible defaults for numeric columns
          if (aiSelectedMeasures.length === 0 && aiSelectedIdentifiers.length > 0) {
            // Default to sum of volume (common numeric measure)
            aiSelectedMeasures.push({
              field: 'volume', // Will be validated when data is loaded
              aggregator: 'Sum',
              weight_by: '',
              rename_to: 'total_volume'
            });
          }
          
          console.log('🔧 AUTO-POPULATED GROUPBY SETTINGS:', {
            selectedIdentifiers: aiSelectedIdentifiers,
            selectedMeasures: aiSelectedMeasures,
            singleFileName: singleFileName
          });
          
          // Update atom settings with the AI configuration and auto-populated options
          updateAtomSettings(atomId, { 
            aiConfig: cfg,
            aiMessage: data.message,
            operationCompleted: false,
            // Auto-populate the interface
            selectedIdentifiers: aiSelectedIdentifiers,
            selectedMeasures: aiSelectedMeasures,
            selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
            // Set default aggregation methods
            selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
            // Set data source if available - use single file only
            dataSource: singleFileName || cfg.file_key || '',
            // Set bucket name
            bucketName: cfg.bucket_name || 'trinity'
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI groupby configuration completed'}\n\nFile: ${singleFileName || 'N/A'}\nIdentifiers: ${cfg.identifiers?.join(', ') || 'N/A'}\nAggregations: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n🔄 Executing groupby operation automatically...`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // 🔧 CRITICAL FIX: Automatically execute GroupBy operation after AI configuration
          // This eliminates the need for users to manually click the Perform button
          try {
            console.log('🤖 AUTO-EXECUTING GroupBy operation with AI configuration...');
            
            // 🔧 FIX: Use single file name, not comma-separated list
            const formData = new URLSearchParams({
              object_names: singleFileName,  // Single file only
              bucket_name: cfg.bucket_name || 'trinity',
              identifiers: JSON.stringify(aiSelectedIdentifiers),
              aggregations: JSON.stringify(cfg.aggregations || {}),
              validator_atom_id: atomId,
              file_key: singleFileName,  // Single file only
            });
            
            console.log('📤 Auto-executing GroupBy with data:', Object.fromEntries(formData.entries()));
            
            // Automatically call the GroupBy backend API
            const res = await fetch(performEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: formData,
            });
            
            console.log('📥 Auto-execution response:', {
              status: res.status,
              statusText: res.statusText,
              ok: res.ok
            });
            
            if (res.ok) {
              const result = await res.json();
              console.log('✅ Auto-execution successful:', result);
              
              // Update atom settings with results
              updateAtomSettings(atomId, {
                aiConfig: cfg,
                aiMessage: data.message,
                groupbyResults: result,
                operationCompleted: true
              });
              
              // Add completion message
              const completionMsg: Message = {
                id: (Date.now() + 1).toString(),
                content: `🎉 GroupBy operation completed automatically!\n\nStatus: ${result.status}\nResult File: ${result.result_file}\nRow Count: ${result.row_count}\nColumns: ${result.columns?.length || 0}\n\n✅ Results are now displayed in the interface!`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, completionMsg]);
              
            } else {
              console.error('❌ Auto-execution failed:', res.status, res.statusText);
              
              let errorDetail = res.statusText;
              try {
                const errorData = await res.json();
                errorDetail = errorData.detail || errorData.message || res.statusText;
              } catch (e) {
                // If we can't parse error response, use status text
              }
              
              const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                content: `❌ Auto-execution failed: ${res.status}\n\nError: ${errorDetail}\n\nYou can still try clicking the Perform button manually.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
              
              updateAtomSettings(atomId, {
                aiConfig: cfg,
                aiMessage: data.message,
                operationCompleted: false
              });
            }
          } catch (error) {
            console.error('❌ Error in auto-execution:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Auto-execution error: ${error.message || 'Unknown error occurred'}\n\nYou can still try clicking the Perform button manually.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            updateAtomSettings(atomId, {
              aiConfig: cfg,
              aiMessage: data.message,
              operationCompleted: false
            });
          }
        }
      } else {
        // Handle AI suggestions when complete info is not available
        if (data.suggestions && Array.isArray(data.suggestions)) {
          const suggestionsMsg: Message = { 
            id: (Date.now() + 1).toString(), 
            content: `💡 ${data.message || 'AI needs more information'}\n\n${data.suggestions.join('\n')}\n\n${data.next_steps ? data.next_steps.join('\n') : ''}`,
            sender: 'ai', 
            timestamp: new Date() 
          };
          setMessages(prev => [...prev, suggestionsMsg]);
          
          // Store suggestions for potential use
          updateAtomSettings(atomId, {
            aiSuggestions: data.suggestions,
            aiNextSteps: data.next_steps || [],
            recommendedFiles: data.recommended_files || []
          });
        } else {
          const aiMsg: Message = { id: (Date.now() + 1).toString(), content: 'Request failed', sender: 'ai', timestamp: new Date() };
          setMessages(prev => [...prev, aiMsg]);
        }
      }
    } catch {
      const aiMsg: Message = { id: (Date.now() + 1).toString(), content: 'Could not reach AI service', sender: 'ai', timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={o => !disabled && setIsOpen(o)}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'p-1 hover:bg-gray-100 rounded',
            disabled ? 'cursor-not-allowed opacity-50' : '',
            className,
          )}
          title="Atom AI"
          disabled={disabled}
        >
          <Sparkles className={cn('w-3.5 h-3.5', disabled ? 'text-gray-300' : 'text-purple-500')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 h-80 p-0 flex flex-col"
        align="start"
        side="bottom"
        sideOffset={8}
        style={{ resize: 'both', overflow: 'auto' }}
      >
        <div className="p-2 border-b border-gray-200 bg-white rounded-t-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-800">{atomTitle} AI</span>
            {/* Session ID Display */}
            {sessionId && (
              <div className="flex items-center space-x-2 ml-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-600 font-mono">
                  Session: {sessionId}
                </span>
                <span className="text-xs text-green-600 font-medium">● Active</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {/* Session Management Buttons - Icon-based like ChatGPT */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearChat} 
              className="h-6 w-6 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              title="Clear chat history (keep session)"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearSession} 
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
              title="Start new session (fresh start)"
            >
              <Plus className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-6 w-6 p-0">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className={`flex items-start space-x-2 ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${m.sender === 'ai' ? 'bg-purple-500' : 'bg-gray-600'}`}>
                  {m.sender === 'ai' ? <Bot className="w-3 h-3 text-white" /> : <User className="w-3 h-3 text-white" />}
                </div>
                <Card className={`p-2 text-sm ${m.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'}`}>{m.content}</Card>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-2">
                <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <Card className="p-2 bg-white border border-gray-200">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t border-gray-200 bg-white rounded-b-md">
          <div className="flex space-x-2">
            <Textarea value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={handleKeyPress} placeholder="Ask AI..." className="flex-1 resize-none h-8" />
            <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} className="h-8 px-2 bg-blue-500 text-white">
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AtomAIChatBot;
