import React, { useState, useEffect, useRef, useId } from "react";
import { Box, Typography, Button, Chip, Paper, Portal, Backdrop, Fade, Card, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import BusinessIcon from '@mui/icons-material/Business';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FilterListIcon from '@mui/icons-material/FilterList';
import { DateRange } from 'react-date-range';
import { enGB } from 'date-fns/locale';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { useAlert } from '../../hooks/useAlert';
import AlertModal from '../AlertModal';
import RevenueLastUpdate from '../RevenueLastUpdate';

const formatDateDisplay = (monthDay, year) => {
  const [month, day] = monthDay.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const dateStr = `${parseInt(day)} ${monthNames[parseInt(month) - 1]}`;
  return year ? `${dateStr} ${year}` : dateStr;
};

const getDefaultSelectionRange = () => ({
  startDate: new Date(),
  endDate: new Date(),
  key: 'selection',
});

export const DateRangePickerWithPresets = ({ 
  rangeDates = [],
  onAddRange,
  onRemoveRange,
  availableYears = [],
  selectedYears = [],
  businessUnits = [],
  onBusinessUnitToggle,
  dataType = 'both',
  onDataTypeChange,
  invoiceData = [],
  openPickerSignal = 0,
  showTitle = true,
  showSummary = true,
  allowReplaceExistingRange = false,
  calendarMonths = 2,
  calendarDirection = 'horizontal',
  hidePresetPanel = false,
  hideTrigger = false,
  mobileModal = false,
  mobileFullPage = false,
  onCancel,
  onClose,
}) => {
  const { alertState, showWarning, showError, closeAlert } = useAlert();
  const [selectionRange, setSelectionRange] = useState(getDefaultSelectionRange);
  
  const [showPicker, setShowPicker] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(null);

  const anchorRef = useRef(null);
  const pickerRef = useRef(null);
  const presetSelectId = useId();
  const presetSelectLabelId = `${presetSelectId}-label`;
  const lastOpenPickerSignalRef = useRef(openPickerSignal);
  const resolvedCalendarMonths = Math.max(1, Number(calendarMonths) || 1);
  const isSingleCalendar = resolvedCalendarMonths === 1;
  const isMobilePicker = mobileModal || mobileFullPage;
  const isMobileFullPage = mobileFullPage;
  
  const MAX_RANGE_DATES = 1;
  const isRangeLimitReached = !allowReplaceExistingRange && rangeDates.length >= MAX_RANGE_DATES;

  // Fungsi untuk mendapatkan tanggal berdasarkan preset
  const getPresetDates = (preset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate = new Date(today);
    let endDate = new Date(today);
    
    switch (preset) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today);
        endDate.setDate(today.getDate() - 1);
        break;
      // case 'last3Days':
      //   startDate = new Date(today);
      //   startDate.setDate(today.getDate() - 3);
      //   endDate = new Date(today);
      //   endDate.setDate(today.getDate() - 1);
      //   break;
      case 'last7Days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        endDate = new Date(today);
        endDate.setDate(today.getDate() - 1);
        break;
      case 'last14Days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 14);
        endDate = new Date(today);
        endDate.setDate(today.getDate() - 1);
        break;
      case 'last30Days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        endDate = new Date(today);
        endDate.setDate(today.getDate() - 1);
        break;
      default:
        return null;
    }
    
    return { startDate, endDate };
  };

  // Handler untuk preset range
  const handlePresetSelect = (preset) => {
    const dates = getPresetDates(preset);
    if (dates) {
      setSelectedPreset(preset);
      setSelectionRange({
        startDate: dates.startDate,
        endDate: dates.endDate,
        key: 'selection',
      });
    }
  };

  // Daftar preset ranges
  const presetRanges = [
    { key: 'today', label: 'Today' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'last7Days', label: 'Last 7 Days' },
    { key: 'last14Days', label: 'Last 14 Days' },
    { key: 'last30Days', label: 'Last 30 Days' },
  ]; 

  const resetPickerState = () => {
    setSelectionRange(getDefaultSelectionRange());
    setSelectedPreset(null);
  };

  const handleDismissPicker = (callback) => {
    setShowPicker(false);
    resetPickerState();
    callback?.();
  };

  useEffect(() => {
    if (rangeDates.length > 0) {
      setSelectionRange(getDefaultSelectionRange());
    }
  }, [rangeDates]);

  useEffect(() => {
    // Abaikan nilai awal saat mount agar modal tidak auto-open saat ganti filter.
    if (openPickerSignal === lastOpenPickerSignalRef.current) {
      return;
    }

    lastOpenPickerSignalRef.current = openPickerSignal;

    if (openPickerSignal > 0) {
      setShowPicker(true);
    }
  }, [openPickerSignal]);

  const handleSelect = (ranges) => {
    setSelectionRange(ranges.selection);
  };

  const handleAddRange = () => {
    try {
      // Validasi input
      if (!selectionRange.startDate || !selectionRange.endDate) {
        showWarning('Pilih tanggal mulai dan akhir terlebih dahulu');
        return;
      }
      
      const year = selectionRange.startDate.getFullYear();
      
      const startMonth = String(selectionRange.startDate.getMonth() + 1).padStart(2, '0');
      const startDay = String(selectionRange.startDate.getDate()).padStart(2, '0');
      const endMonth = String(selectionRange.endDate.getMonth() + 1).padStart(2, '0');
      const endDay = String(selectionRange.endDate.getDate()).padStart(2, '0');
      
      const startMonthDay = `${startMonth}-${startDay}`;
      const endMonthDay = `${endMonth}-${endDay}`;
      
      // Validasi tanggal
      const testStartDate = new Date(year, parseInt(startMonth) - 1, parseInt(startDay));
      const testEndDate = new Date(year, parseInt(endMonth) - 1, parseInt(endDay));
      
      // Validasi tanggal mulai valid
      if (testStartDate.getMonth() !== (parseInt(startMonth) - 1) || 
          testStartDate.getDate() !== parseInt(startDay)) {
        showWarning('Tanggal mulai tidak valid');
        return;
      }
      
      if (testEndDate.getMonth() !== (parseInt(endMonth) - 1) || 
          testEndDate.getDate() !== parseInt(endDay)) {
        showWarning('Tanggal akhir tidak valid');
        return;
      }
      
      if (testEndDate < testStartDate) {
        showWarning('Tanggal akhir harus >= tanggal mulai');
        return;
      }
      
      const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
      const diffInDays = Math.floor((testEndDate - testStartDate) / MILLISECONDS_PER_DAY) + 1;
      if (diffInDays > 31) {
        showWarning('Range tanggal maksimal 31 hari');
        return;
      }
      
      const rangeExists = rangeDates.some(range => 
        range.start === startMonthDay && range.end === endMonthDay && range.year === year
      );
      
      if (rangeExists) {
        showWarning('Range dengan tanggal ini sudah ada');
        return;
      }
      
      // Cek maksimal 
      if (MAX_RANGE_DATES === 1 && rangeDates.length >= 1 && !allowReplaceExistingRange) {
        showWarning(`Maksimal ${MAX_RANGE_DATES} range yang bisa dipilih. Hapus range yang ada terlebih dahulu.`);
        return;
      }
      
      try {
        onAddRange({ start: startMonthDay, end: endMonthDay, year });
        
        resetPickerState();
        
        setShowPicker(false);
      } catch (addError) {
        console.error('Error adding range:', addError);
        showError('Error menambahkan range: ' + (addError.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Unexpected error in handleAddRange:', error);
      showError('Terjadi error: ' + (error.message || 'Unknown error'));
    }
  };

  const getMinDate = () => {
    if (availableYears.length === 0) return undefined;
    const minYear = Math.min(...availableYears);
    return new Date(minYear, 0, 1);
  };

  const getMaxDate = () => {
    if (availableYears.length === 0) return undefined;
    const maxYear = Math.max(...availableYears);
    return new Date(maxYear, 11, 31);
  };

  useEffect(() => {
    if (!showPicker || !pickerRef.current) return;

    const applyStyles = () => {
      const picker = pickerRef.current;
      if (!picker) return;

      const definedRangesWrapper = picker.querySelector('.rdr-DefinedRangesWrapper');
      if (definedRangesWrapper) {
        definedRangesWrapper.style.setProperty('display', 'none', 'important');
      }

      const dateRange = picker.querySelector('.rdr-DateRange');
      const calendarWrapper = picker.querySelector('.rdr-CalendarWrapper');
      const calendars = picker.querySelectorAll('.rdr-Calendar');
      const month = picker.querySelector('.rdr-Month');
      const days = picker.querySelectorAll('.rdr-Day');
      const dayNumbers = picker.querySelectorAll('.rdr-DayNumber');
      const weekDays = picker.querySelectorAll('.rdr-WeekDay');
      const dateDisplay = picker.querySelector('.rdr-DateDisplay');
      const dateDisplayItems = picker.querySelectorAll('.rdr-DateDisplayItem');
      const monthYearWrapper = picker.querySelector('.rdr-MonthAndYearWrapper');
      const monthYearPickers = picker.querySelectorAll('.rdr-MonthAndYearPickers');
      const daysContainer = picker.querySelector('.rdr-Days');
      const weekDaysContainer = picker.querySelector('.rdr-WeekDays');
      const dateDisplayWrapper = picker.querySelector('.rdr-DateDisplayWrapper');

      if (dateRange) {
        dateRange.style.setProperty('display', 'flex', 'important');
        dateRange.style.setProperty('flex-direction', isSingleCalendar ? 'column' : 'row', 'important');
        dateRange.style.setProperty('width', '100%', 'important');
      }
      if (calendarWrapper) {
        calendarWrapper.style.setProperty('display', 'flex', 'important');
        calendarWrapper.style.setProperty('flex-direction', isSingleCalendar ? 'column' : 'row', 'important');
        calendarWrapper.style.setProperty('width', '100%', 'important');
      }
      if (calendars.length > 0) {
        calendars.forEach(calendar => {
          calendar.style.setProperty('font-size', '0.875rem', 'important');
          calendar.style.setProperty('width', isSingleCalendar ? '100%' : '50%', 'important');
          calendar.style.setProperty('max-width', isSingleCalendar ? '100%' : '50%', 'important');
          calendar.style.setProperty('flex', isSingleCalendar ? '1 1 100%' : '1 1 50%', 'important');
        });
      }
      if (month) {
        month.style.setProperty('padding', '0.75rem', 'important');
        month.style.setProperty('width', '100%', 'important');
      }
      if (days.length > 0) {
        days.forEach(day => {
          day.style.setProperty('height', '36px', 'important');
          day.style.setProperty('width', '36px', 'important');
          day.style.setProperty('max-width', '36px', 'important');
          day.style.setProperty('max-height', '36px', 'important');
          day.style.setProperty('line-height', '36px', 'important');
          day.style.setProperty('margin', '2px', 'important');
          day.style.setProperty('font-size', '0.875rem', 'important');
        });
      }
      if (dayNumbers.length > 0) {
        dayNumbers.forEach(dayNum => {
          dayNum.style.setProperty('font-size', '0.875rem', 'important');
          dayNum.style.setProperty('padding', '0', 'important');
          dayNum.style.setProperty('line-height', '36px', 'important');
        });
      }
      if (weekDays.length > 0) {
        weekDays.forEach(weekDay => {
          weekDay.style.setProperty('font-size', '0.75rem', 'important');
          weekDay.style.setProperty('padding', '0.5rem', 'important');
          weekDay.style.setProperty('font-weight', '600', 'important');
        });
      }
      if (dateDisplay) {
        dateDisplay.style.setProperty('padding', '0.75rem', 'important');
        dateDisplay.style.setProperty('font-size', '0.875rem', 'important');
        dateDisplay.style.setProperty('min-height', 'auto', 'important');
        dateDisplay.style.setProperty('max-height', 'none', 'important');
      }
      if (dateDisplayItems.length > 0) {
        dateDisplayItems.forEach(item => {
          item.style.setProperty('padding', '0.5rem 0.75rem', 'important');
          item.style.setProperty('font-size', '0.875rem', 'important');
          item.style.setProperty('line-height', '1.5', 'important');
        });
      }
      if (monthYearWrapper) {
        monthYearWrapper.style.setProperty('padding', '0.75rem', 'important');
        monthYearWrapper.style.setProperty('min-height', 'auto', 'important');
        monthYearWrapper.style.setProperty('max-height', 'none', 'important');
      }
      if (monthYearPickers.length > 0) {
        monthYearPickers.forEach(pickerEl => {
          pickerEl.style.setProperty('font-size', '1rem', 'important');
          pickerEl.style.setProperty('font-weight', '600', 'important');
        });
      }
      if (daysContainer) {
        daysContainer.style.setProperty('padding', '0.5rem', 'important');
      }
      if (weekDaysContainer) {
        weekDaysContainer.style.setProperty('padding', '0.5rem 0', 'important');
      }
      if (dateDisplayWrapper) {
        dateDisplayWrapper.style.setProperty('padding', '0.75rem', 'important');
      }
    };

    const timeouts = [
      setTimeout(applyStyles, 0),
      setTimeout(applyStyles, 50),
      setTimeout(applyStyles, 100),
      setTimeout(applyStyles, 200),
    ];

    const observer = new MutationObserver(() => {
      applyStyles();
    });

    if (pickerRef.current) {
      observer.observe(pickerRef.current, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
      observer.disconnect();
    };
  }, [isSingleCalendar, showPicker]);

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 1.5,
      position: 'relative'
    }}>
      {!hideTrigger && showTitle ? (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          mb: 1
        }}>
          <Typography sx={{ 
            fontWeight: 600, 
            fontSize: '0.875rem', 
            color: '#0F172A',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '-0.01em',
            lineHeight: 1.3
          }}>
            Range Tanggal (Bulan & Hari) - Max 1 Range, 31 Hari
          </Typography>
        </Box>
      ) : null}

      {/* Tombol untuk menampilkan DateRangePicker */}
      <Box sx={{ mb: hideTrigger ? 0 : 2, position: 'relative' }} ref={anchorRef}>
        {!hideTrigger ? (
          <Button 
            variant="outlined" 
            size="small" 
            onClick={() => {
              if (showPicker) {
                handleDismissPicker(onClose);
                return;
              }

              setShowPicker(true);
            }}
            disabled={isRangeLimitReached}
            startIcon={
              <CalendarMonthRoundedIcon 
                sx={{ 
                  fontSize: '1.1rem',
                  color: showPicker ? '#2F6FB2' : '#64748B',
                  transition: 'color 0.2s ease'
                }} 
              />
            }
            sx={{
              borderColor: showPicker ? '#2F6FB2' : '#E2E8F0',
              color: showPicker ? '#2F6FB2' : '#475569',
              bgcolor: showPicker ? 'rgba(47, 111, 178, 0.08)' : 'transparent',
              textTransform: 'none',
              fontSize: '0.8125rem',
              fontWeight: showPicker ? 600 : 500,
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              borderRadius: 1.5,
              px: 2,
              py: 0.875,
              minWidth: '180px',
              height: '38px',
              boxShadow: showPicker ? '0 2px 4px rgba(47, 111, 178, 0.15)' : 'none',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                borderColor: '#2F6FB2',
                bgcolor: showPicker ? 'rgba(47, 111, 178, 0.12)' : 'rgba(47, 111, 178, 0.06)',
                boxShadow: showPicker ? '0 2px 6px rgba(47, 111, 178, 0.2)' : 'none',
                transform: 'translateY(-1px)'
              },
              '&:active': {
                transform: 'translateY(0)'
              },
              '&:disabled': {
                borderColor: '#E2E8F0',
                color: '#94A3B8',
                bgcolor: '#F8FAFC',
                transform: 'none',
                cursor: 'not-allowed'
              }
            }}
          >
            {showPicker ? 'Tutup Kalender' : 'Pilih Range Tanggal'}
          </Button>
        ) : null}

        {/* Backdrop Overlay dengan Portal */}
        {showPicker && (
          <Portal>
            {!isMobileFullPage ? (
              <Backdrop
                open={showPicker}
                onClick={() => handleDismissPicker(onClose)}
                sx={{
                  zIndex: (theme) => theme.zIndex.modal + 29,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            ) : null}
            
            {/* DateRangePicker Overlay */}
            <Fade in={showPicker} timeout={300}>
              <Paper
                ref={pickerRef}
                elevation={8}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  position: 'fixed',
                  top: isMobileFullPage ? 0 : '50%',
                  left: isMobileFullPage ? 0 : '50%',
                  right: isMobileFullPage ? 0 : 'auto',
                  bottom: isMobileFullPage ? 0 : 'auto',
                  transform: isMobileFullPage ? 'none' : 'translate(-50%, -50%)',
                  zIndex: (theme) => theme.zIndex.modal + 30,
                  borderRadius: isMobileFullPage ? 0 : 3,
                  overflow: 'hidden',
                  bgcolor: 'white',
                  border: isMobileFullPage ? 'none' : '1px solid #E2E8F0',
                  boxShadow: isMobileFullPage ? 'none' : '0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.2)',
                  width: isMobileFullPage
                    ? '100vw'
                    : isMobilePicker
                      ? { xs: 'min(calc(100vw - 20px), 420px)', sm: 'min(92vw, 440px)', md: isSingleCalendar ? '520px' : '760px' }
                      : { xs: '95%', sm: '90%', md: isSingleCalendar ? '620px' : '800px', lg: isSingleCalendar ? '680px' : '950px' },
                  maxWidth: isMobileFullPage
                    ? '100vw'
                    : isMobilePicker
                      ? (isSingleCalendar ? '440px' : '760px')
                      : (isSingleCalendar ? '680px' : '950px'),
                  height: isMobileFullPage ? '100dvh' : 'auto',
                  maxHeight: isMobileFullPage ? '100dvh' : (isMobilePicker ? 'calc(100dvh - 28px)' : '90vh'),
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '& *': {
                    boxSizing: 'border-box',
                  },
                  // Sembunyikan preset ranges
                  '& .rdr-DefinedRangesWrapper': {
                    display: 'none !important',
                  },
                  '& .rdr-DateRangePicker': {
                    borderRadius: 3,
                    width: '100%',
                    maxWidth: '100%',
                  },
                  '& .rdr-DateRange': {
                    borderRadius: 3,
                    width: '100%',
                    maxWidth: '100%',
                    display: 'flex !important',
                    flexDirection: isSingleCalendar ? 'column !important' : 'row !important',
                  },
                  '& .rdr-CalendarWrapper': {
                    display: 'flex !important',
                    flexDirection: isSingleCalendar ? 'column !important' : 'row !important',
                    width: '100% !important',
                  },
                  '& .rdr-Calendar': {
                    borderRadius: 3,
                    width: isSingleCalendar ? '100% !important' : '50% !important',
                    maxWidth: isSingleCalendar ? '100% !important' : '50% !important',
                    fontSize: '0.875rem !important',
                    minHeight: 'auto !important',
                    flex: isSingleCalendar ? '1 1 100% !important' : '1 1 50% !important',
                  },
                  '& .rdr-Month': {
                    width: '100% !important',
                    maxWidth: '100% !important',
                    padding: '0.75rem !important',
                    minHeight: 'auto !important',
                  },
                  '& .rdr-Day': {
                    fontSize: '0.875rem !important',
                    height: '36px !important',
                    width: '36px !important',
                    maxWidth: '36px !important',
                    maxHeight: '36px !important',
                    lineHeight: '36px !important',
                    margin: '2px !important',
                    padding: '0 !important',
                  },
                  '& .rdr-DayNumber': {
                    fontSize: '0.875rem !important',
                    padding: '0 !important',
                    lineHeight: '36px !important',
                  },
                  '& .rdr-MonthAndYearWrapper': {
                    paddingTop: '0.75rem !important',
                    paddingBottom: '0.75rem !important',
                    paddingLeft: '0.75rem !important',
                    paddingRight: '0.75rem !important',
                    minHeight: 'auto !important',
                    maxHeight: 'none !important',
                  },
                  '& .rdr-MonthAndYearPickers': {
                    fontSize: '1rem !important',
                    fontWeight: '600 !important',
                    padding: '0 !important',
                  },
                  '& .rdr-WeekDay': {
                    fontSize: '0.75rem !important',
                    fontWeight: '600 !important',
                    padding: '0.5rem !important',
                    height: 'auto !important',
                    minHeight: 'auto !important',
                  },
                  '& .rdr-Days': {
                    padding: '0.5rem !important',
                    margin: '0 !important',
                  },
                  '& .rdr-DateDisplay': {
                    padding: '0.75rem !important',
                    fontSize: '0.875rem !important',
                    minHeight: 'auto !important',
                    maxHeight: 'none !important',
                  },
                  '& .rdr-DateDisplayItem': {
                    padding: '0.5rem 0.75rem !important',
                    fontSize: '0.875rem !important',
                    lineHeight: '1.5 !important',
                  },
                  '& .rdr-WeekDays': {
                    padding: '0.5rem 0 !important',
                    margin: '0 !important',
                  },
                  '& .rdr-DateDisplayWrapper': {
                    padding: '0.75rem !important',
                    margin: '0 !important',
                  }
                }}
              >
                {/* Header dengan judul dan tombol tutup */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  pt: isMobileFullPage ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : 2,
                  pb: 1.5,
                  borderBottom: '1px solid #F1F5F9',
                  bgcolor: '#FAFBFC',
                  position: isMobileFullPage ? 'sticky' : 'static',
                  top: 0,
                  zIndex: 1
                }}>
                  <Typography sx={{
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: '#0F172A',
                    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    letterSpacing: '-0.01em'
                  }}>
                    Pilih Range Tanggal
                  </Typography>
                  <Button
                    onClick={() => handleDismissPicker(onClose)}
                    sx={{
                      minWidth: 'auto',
                      width: '32px',
                      height: '32px',
                      p: 0,
                      borderRadius: '50%',
                      color: '#64748B',
                      '&:hover': {
                        bgcolor: '#F1F5F9',
                        color: '#0F172A'
                      }
                    }}
                  >
                    X
                  </Button>
                </Box>

                <Box sx={{
                  p: isMobilePicker ? 1.25 : 2,
                  pb: isMobileFullPage ? 'calc(env(safe-area-inset-bottom, 0px) + 12px)' : undefined,
                  bgcolor: 'white',
                  flex: isMobileFullPage ? 1 : 'none',
                  overflowY: isMobileFullPage ? 'auto' : 'visible'
                }}>
                  {hidePresetPanel ? (
                    <FormControl fullWidth size="small" sx={{ mb: 1.25 }}>
                      <InputLabel
                        id={presetSelectLabelId}
                        sx={{
                          fontSize: '0.8125rem',
                          color: '#64748B',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          '&.Mui-focused': {
                            color: '#2F6FB2'
                          }
                        }}
                      >
                        Preset Range
                      </InputLabel>
                      <Select
                        labelId={presetSelectLabelId}
                        id={presetSelectId}
                        value={selectedPreset || ''}
                        label="Preset Range"
                        MenuProps={{
                          sx: {
                            zIndex: (theme) => theme.zIndex.modal + 40
                          },
                          PaperProps: {
                            sx: {
                              mt: 0.5,
                              borderRadius: 1.5,
                              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
                              border: '1px solid #E2E8F0'
                            }
                          }
                        }}
                        onChange={(event) => {
                          const presetValue = event.target.value;
                          if (!presetValue) {
                            setSelectedPreset(null);
                            return;
                          }
                          handlePresetSelect(presetValue);
                        }}
                        sx={{
                          fontSize: '0.875rem',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          borderRadius: 1.5,
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: '#E2E8F0'
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: '#CBD5E1'
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: '#2F6FB2'
                          }
                        }}
                      >
                        <MenuItem
                          value=""
                          sx={{
                            fontSize: '0.875rem',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                            color: '#64748B'
                          }}
                        >
                          Pilih Preset
                        </MenuItem>
                        {presetRanges.map((preset) => (
                          <MenuItem
                            key={`dropdown-${preset.key}`}
                            value={preset.key}
                            sx={{
                              fontSize: '0.875rem',
                              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                            }}
                          >
                            {preset.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : null}

                  <Box sx={{
                    display: 'flex',
                    flexDirection: hidePresetPanel ? 'column' : { xs: 'column', md: 'row' },
                    width: '100%',
                    bgcolor: 'white',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}>
                    {/* Panel Preset Ranges di Sisi Kiri */}
                    {!hidePresetPanel ? (
                      <Box sx={{
                        width: { xs: '100%', md: '200px' },
                        minWidth: { md: '200px' },
                        borderRight: { md: '1px solid #F1F5F9' },
                        borderBottom: { xs: '1px solid #F1F5F9', md: 'none' },
                        bgcolor: '#FAFBFC',
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                      }}>
                        {presetRanges.map((preset) => (
                          <Button
                            key={preset.key}
                            onClick={() => handlePresetSelect(preset.key)}
                            sx={{
                              justifyContent: 'flex-start',
                              textTransform: 'none',
                              fontSize: '0.875rem',
                              fontWeight: selectedPreset === preset.key ? 600 : 400,
                              color: selectedPreset === preset.key ? '#2F6FB2' : '#475569',
                              bgcolor: selectedPreset === preset.key ? 'rgba(47, 111, 178, 0.08)' : 'transparent',
                              borderRadius: 1.5,
                              px: 1.5,
                              py: 0.875,
                              minHeight: '36px',
                              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              '&:hover': {
                                bgcolor: selectedPreset === preset.key
                                  ? 'rgba(47, 111, 178, 0.12)'
                                  : 'rgba(47, 111, 178, 0.06)',
                                color: '#2F6FB2',
                              },
                            }}
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </Box>
                    ) : null}

                    {/* Kalender di Sisi Kanan */}
                    <Box sx={{
                      flex: 1,
                      p: 2,
                      bgcolor: 'white',
                      borderRadius: 3,
                      overflow: 'hidden',
                      '& > div': {
                        width: '100% !important',
                      }
                    }}>
                      <DateRange
                        ranges={[selectionRange]}
                        onChange={(ranges) => {
                          handleSelect(ranges);
                          setSelectedPreset(null); // Reset preset saat user memilih manual
                        }}
                        minDate={getMinDate()}
                        maxDate={getMaxDate()}
                        months={resolvedCalendarMonths}
                        direction={calendarDirection}
                        showDateDisplay={true}
                        showMonthAndYearPickers={true}
                        locale={enGB}
                      />
                    </Box>
                  </Box>
                  
                  {/* Tombol Batal dan Tambah Range */}
                  <Box sx={{ 
                    display: 'flex', 
                    gap: 1,
                    mt: 1.5,
                    pt: 2,
                    borderTop: '1px solid #F1F5F9',
                    justifyContent: isMobilePicker ? 'stretch' : 'flex-end',
                    flexDirection: 'row'
                  }}>
                    <Button 
                      variant="outlined" 
                      size="medium" 
                      onClick={() => handleDismissPicker(onCancel ?? onClose)}
                      sx={{
                        borderColor: '#CBD5E1',
                        color: '#475569',
                        textTransform: 'none',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        borderRadius: 1.5,
                        flex: isMobilePicker ? 1 : '0 0 auto',
                        px: 2.5,
                        py: 0.75,
                        minWidth: isMobilePicker ? 0 : '100px',
                        height: '40px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          borderColor: '#2F6FB2',
                          color: '#2F6FB2',
                          bgcolor: 'rgba(47, 111, 178, 0.08)',
                          boxShadow: '0 2px 4px rgba(47, 111, 178, 0.15)',
                        }
                      }}
                    >
                      Batal
                    </Button>
                    <Button 
                      variant="contained" 
                      size="medium" 
                      onClick={handleAddRange}
                      disabled={isRangeLimitReached}
                      sx={{
                        bgcolor: '#2F6FB2',
                        color: 'white',
                        textTransform: 'none',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        borderRadius: 1.5,
                        flex: isMobilePicker ? 1 : '0 0 auto',
                        px: 3,
                        py: 0.75,
                        minWidth: isMobilePicker ? 0 : '140px',
                        height: '40px',
                        boxShadow: '0 2px 4px rgba(47, 111, 178, 0.2)',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          bgcolor: '#1F4E8C',
                          boxShadow: '0 4px 8px rgba(47, 111, 178, 0.3)',
                          transform: 'translateY(-1px)'
                        },
                        '&:active': {
                          transform: 'translateY(0)',
                          boxShadow: '0 2px 4px rgba(47, 111, 178, 0.25)'
                        },
                        '&:disabled': {
                          bgcolor: '#E2E8F0',
                          color: '#94A3B8',
                          boxShadow: 'none',
                          transform: 'none',
                          cursor: 'not-allowed'
                        }
                      }}
                    >
                      Tambah Range
                    </Button>
                  </Box>
                </Box>
              </Paper>
            </Fade>
          </Portal>
        )}
      </Box>

      {!hideTrigger ? (
        <Typography sx={{ 
          fontSize: '0.75rem', 
          color: '#64748B',
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          lineHeight: 1.5,
          mt: 0.5,
          fontStyle: 'italic'
        }}>
          {showPicker 
            ? '* Pilih range tanggal menggunakan kalender, lalu klik "Tambah Range". Tahun akan diambil dari tanggal yang dipilih.'
            : allowReplaceExistingRange && rangeDates.length > 0
              ? '* Klik tombol "Pilih Range Tanggal" untuk mengganti range yang sudah ada.'
              : '* Klik tombol "Pilih Range Tanggal" untuk memilih range tanggal.'}
        </Typography>
      ) : null}

      {showSummary ? (
        <Box sx={{ 
          mt: 1.5,
          pt: 1.5,
          borderTop: '1px solid #F1F5F9'
        }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              mb: 1
            }}
          >
            <Typography sx={{ 
              fontSize: '0.875rem', 
              fontWeight: 600, 
              color: '#0F172A',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              letterSpacing: '-0.01em',
              lineHeight: 1.3
            }}>
              Ringkasan Data
            </Typography>
            <RevenueLastUpdate
              sx={{
                maxWidth: '100%',
              }}
            />
          </Box>
          
          <Box sx={{ 
            display: 'grid',
            gridTemplateColumns: { 
              xs: 'repeat(2, 1fr)', 
              sm: 'repeat(2, 1fr)', 
              md: 'repeat(4, 1fr)' 
            },
            gap: { xs: 1, md: 1.25 }
          }}>
            {/* Business Unit */}
            <Card sx={{ 
              bgcolor: '#FAFAFA', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              border: '1px solid #E5E7EB',
              p: { xs: 1.5, md: 2 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
              '&:hover': {
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                borderColor: '#D1D5DB',
                bgcolor: '#FFFFFF',
                transform: 'translateY(-1px)'
              }
            }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between'
              }}>
                <Typography sx={{ 
                  fontSize: '0.6875rem', 
                  color: '#757575',
                  fontWeight: 500,
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  lineHeight: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5
                }}>
                  <Box sx={{ 
                    color: '#9E9E9E',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.875rem'
                  }}>
                    <BusinessIcon />
                  </Box>
                  BUSINESS UNIT
                </Typography>
              </Box>
              <Typography sx={{ 
                fontSize: { xs: '0.875rem', md: '0.9375rem' }, 
                fontWeight: 600, 
                color: '#212121',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                lineHeight: 1.4,
                wordBreak: 'break-word'
              }}>
                {businessUnits && businessUnits.length > 0 ? businessUnits.join(', ') : 'Belum dipilih'}
              </Typography>
            </Card>

            {/* Range Tanggal */}
            <Card sx={{ 
              bgcolor: '#FAFAFA', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              border: '1px solid #E5E7EB',
              p: { xs: 1.5, md: 2 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
              '&:hover': {
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                borderColor: '#D1D5DB',
                bgcolor: '#FFFFFF',
                transform: 'translateY(-1px)'
              }
            }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
              }}>
                <Typography sx={{ 
                  fontSize: '0.6875rem', 
                  color: '#757575',
                  fontWeight: 500,
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  lineHeight: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5
                }}>
                  <Box sx={{ 
                    color: '#9E9E9E',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.875rem'
                  }}>
                    <CalendarMonthIcon />
                  </Box>
                  RANGE TANGGAL
                </Typography>
              </Box>
              <Typography sx={{ 
                fontSize: { xs: '0.875rem', md: '0.9375rem' }, 
                fontWeight: 600, 
                color: '#212121',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                lineHeight: 1.4,
                wordBreak: 'break-word'
              }}>
                {rangeDates && rangeDates.length > 0 
                  ? rangeDates.map(range => `${formatDateDisplay(range.start, range.year)} - ${formatDateDisplay(range.end, range.year)}`).join(', ')
                  : 'Belum dipilih'}
              </Typography>
            </Card>

            {/* Status Data */}
            <Card sx={{ 
              bgcolor: '#FAFAFA', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              border: '1px solid #E5E7EB',
              p: { xs: 1.5, md: 2 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
              '&:hover': {
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                borderColor: '#D1D5DB',
                bgcolor: '#FFFFFF',
                transform: 'translateY(-1px)'
              }
            }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
              }}>
                <Typography sx={{ 
                  fontSize: '0.6875rem', 
                  color: '#757575',
                  fontWeight: 500,
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  lineHeight: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5
                }}>
                  <Box sx={{ 
                    color: '#9E9E9E',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.875rem'
                  }}>
                    <CheckCircleIcon />
                  </Box>
                  STATUS DATA
                </Typography>
              </Box>
              <Typography sx={{ 
                fontSize: { xs: '0.875rem', md: '0.9375rem' }, 
                fontWeight: 600, 
                color: '#212121',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75
              }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: invoiceData && invoiceData.length > 0 ? '#2F6FB2' : '#BDBDBD',
                    flexShrink: 0
                  }}
                />
                {invoiceData && invoiceData.length > 0 ? 'Dimuat' : 'Belum dimuat'}
              </Typography>
            </Card>

            {/* Tipe Filter */}
            <Card sx={{ 
              bgcolor: '#FAFAFA', 
              borderRadius: '12px', 
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              border: '1px solid #E5E7EB',
              p: { xs: 1.5, md: 2 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
              '&:hover': {
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                borderColor: '#D1D5DB',
                bgcolor: '#FFFFFF',
                transform: 'translateY(-1px)'
              }
            }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
              }}>
                <Typography sx={{ 
                  fontSize: '0.6875rem', 
                  color: '#757575',
                  fontWeight: 500,
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  lineHeight: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5
                }}>
                  <Box sx={{ 
                    color: '#9E9E9E',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.875rem'
                  }}>
                    <FilterListIcon />
                  </Box>
                  TIPE FILTER
                </Typography>
              </Box>
              <Typography sx={{ 
                fontSize: { xs: '0.875rem', md: '0.9375rem' }, 
                fontWeight: 600, 
                color: '#212121',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
                lineHeight: 1.4,
                wordBreak: 'break-word'
              }}>
                Range Tanggal (Bulan & Hari)
              </Typography>
            </Card>
          </Box>
        </Box>
      ) : null}

      {/* Daftar Range yang Sudah Ditambahkan */}
      {!hideTrigger && rangeDates.length > 0 && (
        <Box sx={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 0.75, 
          mt: 1.5,
          pt: 1.5,
          borderTop: '1px solid #F1F5F9'
        }}>
          {rangeDates.map((range, index) => (
            <Chip
              key={`${range.start}_${range.end}_${range.year}_${index}`}
              label={`${formatDateDisplay(range.start, range.year)} - ${formatDateDisplay(range.end, range.year)}`}
              onDelete={() => onRemoveRange(range)}
              size="small"
              variant="outlined"
              sx={{
                borderColor: '#E2E8F0',
                color: '#475569',
                fontSize: '0.75rem',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                height: 28,
                borderRadius: 1.5,
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: '#CBD5E1',
                  bgcolor: '#F8FAFC'
                },
                '& .MuiChip-deleteIcon': {
                  color: '#94A3B8',
                  fontSize: '0.875rem',
                  '&:hover': {
                    color: '#64748B'
                  }
                }
              }}
            />
          ))}
        </Box>
      )}

      {/* Alert Modal */}
      <AlertModal
        open={alertState.open}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        severity={alertState.severity}
      />
    </Box>
  );
};

export default DateRangePickerWithPresets;
