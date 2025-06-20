import React, { useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CancelIcon from '@mui/icons-material/Cancel';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { VALIDATE_API } from '@/lib/api';

// Validation status types
type ValidationStatus = 'success' | 'warning' | 'error';

interface ValidationItem {
  id: number;
  label: string;
  status: ValidationStatus;
}

const VALIDATIONS: ValidationItem[] = [
  { id: 1, label: 'Validation 1', status: 'success' },
  { id: 2, label: 'Validation 2', status: 'success' },
  { id: 3, label: 'Validation 3', status: 'success' },
  { id: 4, label: 'Validation 4', status: 'success' },
  { id: 5, label: 'Validation 5', status: 'warning' },
  { id: 6, label: 'Validation 6', status: 'warning' },
  { id: 7, label: 'Validation 7', status: 'warning' },
  { id: 8, label: 'Validation 8', status: 'error' },
  { id: 9, label: 'Validation 9', status: 'error' },
];

const ATOMS = [
  'Data Upload',
  'Base Price Detection',
  'Comment',
  'Atom #',
  'Atom #',
  'Feature Overview',
  'Promo Price Estimation',
];

const STEPS = [
  'Pre-Process',
  'Explore',
  'Engineer',
  'Build',
  'Evaluate',
  'Plan',
  'Report',
];

const SUB_STEPS = [
  'Data Upload',
  'Feature Overview',
  'Base Price Detection',
  'Promo Price Estimation',
];

const DataUploadPage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down('md'));

  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ status?: string; message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setFileName(f.name);
    }
  };

  const handleValidate = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('validator_atom_id', 'demo-validator');
      form.append('files', file);
      form.append('file_keys', JSON.stringify(['data']));
      const res = await fetch(`${VALIDATE_API}/validate`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error('Validation request failed');
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Grid container sx={{ height: '100vh', overflow: 'hidden' }}>
      {/* Left-hand atoms palette */}
      <Grid
        item
        xs={12}
        md={2.5}
        sx={{
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: '#f5f5f5',
          p: 2,
          overflowY: 'auto',
        }}
      >
        {ATOMS.map((atom) => (
          <Paper
            key={atom}
            elevation={1}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 48,
              mb: 1.5,
              bgcolor: '#dfe1e5',
              cursor: 'grab',
              typography: 'body2',
              fontWeight: 600,
            }}
          >
            {atom}
          </Paper>
        ))}

        <Divider sx={{ my: 2 }} />

        {/* Mock “Select a file” dropdown */}
        <Typography variant="caption" fontWeight={600}>
          Select a File for Analysis
        </Typography>
        <Paper
          elevation={0}
          sx={{
            mt: 1,
            p: 1,
            bgcolor: '#fff',
            border: 1,
            borderColor: 'divider',
            typography: 'caption',
            overflowX: 'auto',
          }}
        >
          {fileName ?? '––'}
        </Paper>
      </Grid>

      {/* Main content */}
      <Grid item xs={12} md={9.5} sx={{ p: isSmDown ? 2 : 4, overflowY: 'auto' }}>
        {/* Step navigation */}
        <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {STEPS.map((step) => (
            <Chip
              key={step}
              label={step}
              variant={step === 'Pre-Process' ? 'filled' : 'outlined'}
              color={step === 'Pre-Process' ? 'primary' : 'default'}
              sx={{ fontWeight: 600 }}
            />
          ))}
        </Box>

        {/* Sub-step chips */}
        <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {SUB_STEPS.map((sub) => (
            <Chip
              key={sub}
              label={sub}
              variant={sub === 'Data Upload' ? 'filled' : 'outlined'}
              color={sub === 'Data Upload' ? 'secondary' : 'default'}
              sx={{ fontWeight: 500 }}
            />
          ))}
        </Box>

        {/* Upload control */}
        <Paper
          elevation={1}
          sx={{
            p: 3,
            maxWidth: 480,
            bgcolor: '#fafafa',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Typography fontWeight={600} mb={1}>
            Upload Your Data
          </Typography>

          <input
            type="file"
            accept=".csv,.xlsx"
            hidden
            ref={fileInputRef}
            onChange={handleFileSelect}
          />

          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            fullWidth
          >
            {fileName ? 'Replace File' : 'Upload a CSV/XLSX'}
          </Button>

          {fileName && (
            <Box
              mt={1}
              p={1}
              border={1}
              borderColor="divider"
              borderRadius={1}
              bgcolor="#fff"
              typography="caption"
            >
              {fileName}
            </Box>
          )}

          <Box mt={2}>
            <Button
              variant="outlined"
              fullWidth
              disabled={!fileName || uploading}
              onClick={handleValidate}
            >
              Validate Data
            </Button>
          </Box>
        </Paper>

        {/* Validation report */}
        {fileName && (
          <>
            <Typography mt={4} mb={1} fontWeight={600}>
              Validation Report
            </Typography>
            <Grid container spacing={1}>
              {VALIDATIONS.map(({ id, label, status }) => {
                const icon =
                  status === 'success' ? (
                    <CheckCircleIcon color="success" fontSize="small" />
                  ) : status === 'warning' ? (
                    <WarningAmberIcon color="warning" fontSize="small" />
                  ) : (
                    <CancelIcon color="error" fontSize="small" />
                  );

                const footnote =
                  status === 'success'
                    ? '*Successful'
                    : status === 'warning'
                    ? '*Autofixed'
                    : '*Unsuccessful';

                return (
                  <Grid item key={id}>
                    <Paper
                      elevation={0}
                      sx={{
                        px: 2,
                        py: 1,
                        border: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      {icon}
                      <Typography fontSize="0.825rem">{label}</Typography>
                      <Typography
                        variant="caption"
                        sx={{ ml: 0.5, opacity: 0.7 }}
                      >
                        {footnote}
                      </Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>

            {/* Note */}
            <Box mt={2}>
              <Typography variant="subtitle2" fontWeight={700}>
                Note :
              </Typography>
              <Typography variant="caption">
                *Include the Mandatory Columns
              </Typography>
            </Box>
          </>
        )}

        {/* Data overview */}
        {fileName && (
          <Box mt={4}>
            <Button
              variant="outlined"
              onClick={() => setShowTable(true)}
              sx={{ mb: 2 }}
            >
              Data Overview
            </Button>

            {showTable && (
              <Box>
                <Typography fontWeight={600} mb={1}>
                  Data Overview
                </Typography>
                <Table size="small" sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      {Array.from({ length: 9 }, (_, i) => (
                        <TableCell key={i} align="center" sx={{ fontWeight: 600 }}>
                          Column {i + 1}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, r) => (
                      <TableRow key={r}>
                        {Array.from({ length: 9 }).map((__, c) => (
                          <TableCell key={c} />
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>
        )}

        {/* Proceed button */}
        {fileName && (
          <Box mt={4} display="flex" justifyContent="flex-end">
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              onClick={() => {}}
            >
              Proceed to Feature Overview
            </Button>
          </Box>
        )}
      </Grid>
    </Grid>
  );
};

export default DataUploadPage;
