// The three requirements forms, transcribed from the printed PDFs. Each section is a list of
// tick-box choices; every section also takes an "Other" note, and a short block of details
// comes first. Unticked options are simply not ordered.

export const REQUIREMENT_DETAILS = [
  { id: 'fullName', label: 'Full name', type: 'text', required: true, placeholder: 'Your name' },
  { id: 'company', label: 'Company / business', type: 'text', placeholder: 'Business name' },
  { id: 'email', label: 'Email', type: 'email', placeholder: 'you@company.com' },
  { id: 'phone', label: 'Phone / WhatsApp', type: 'tel', placeholder: '+1 555 000 0000' },
  { id: 'budget', label: 'Budget range', type: 'text', placeholder: 'e.g. 50,000 – 80,000 EGP' },
  { id: 'deadline', label: 'Needed by', type: 'date' },
  {
    id: 'description',
    label: 'Describe your idea in a few sentences: what is the project and who will use it?',
    type: 'textarea',
    required: true,
    placeholder: 'A short description helps us quote accurately.'
  }
];

export const REQUIREMENT_FORMS = {
  website: {
    id: 'website',
    label: 'Website',
    title: 'Website Project Requirements',
    sections: [
      {
        id: 'type',
        title: 'Type of website',
        options: [
          'Company / corporate site', 'Personal / portfolio site', 'Online store (e-commerce)',
          'Blog or news site', 'Single-page landing page', 'Booking & appointments',
          'Real-estate listings', 'Courses & education', 'Directory / marketplace',
          'Restaurant / café menu', 'Event / wedding page', 'Non-profit / charity'
        ]
      },
      {
        id: 'pages',
        title: 'Pages',
        options: [
          'Home', 'About us', 'Services', 'Portfolio / gallery', 'Pricing plans', 'Blog / articles',
          'FAQ', 'Contact us', 'Team members', 'Careers', 'Clients / partners',
          'Terms & privacy policy', 'Branches / locations', 'Case studies'
        ]
      },
      {
        id: 'features',
        title: 'Core features',
        options: [
          'Contact form', 'WhatsApp button', 'Live chat', 'Newsletter signup', 'Search bar',
          'Arabic & English (multi-language)', 'Dark mode', 'Testimonials', 'Photo & video gallery',
          'Google Maps', 'Social media links', 'Share buttons', 'Downloadable files (PDF)',
          'Cookie consent banner', 'Popup / offers banner', 'Countdown timer'
        ]
      },
      {
        id: 'accounts',
        title: 'Accounts & members',
        options: [
          'User registration & login', 'Social login (Google / Facebook)', 'Customer profile page',
          'Order / booking history', 'Member-only content', 'Email verification', 'Password reset'
        ]
      },
      {
        id: 'store',
        title: 'Online store (if needed)',
        options: [
          'Product catalog & categories', 'Product options (size / color)', 'Shopping cart & checkout',
          'Card payment', 'Mobile wallet payment', 'Cash on delivery', 'Discount & coupon codes',
          'Order tracking', 'Inventory management', 'Shipping rates by city', 'Wishlist',
          'Product reviews & ratings', 'Invoices by email', 'Abandoned-cart reminders'
        ]
      },
      {
        id: 'booking',
        title: 'Booking & services',
        options: [
          'Online booking calendar', 'Service prices & duration', 'Staff / branch selection',
          'Booking confirmation by email / SMS', 'Online deposit payment', 'Cancel / reschedule appointment'
        ]
      },
      {
        id: 'admin',
        title: 'Admin & management',
        options: [
          'Admin dashboard', 'Edit texts & images myself', 'Manage products / posts', 'Manage users',
          'Orders management', 'Sales & visitor reports', 'Multiple admin roles', 'Data backup'
        ]
      },
      {
        id: 'design',
        title: 'Design',
        options: [
          'Logo design', 'Use my brand colors', 'Modern & minimal', 'Luxury / premium',
          'Colorful & playful', 'Fully mobile-friendly', 'Animations & effects',
          'Custom illustrations / icons', 'Sample designs before starting', 'Right-to-left (Arabic) layout'
        ]
      },
      {
        id: 'content',
        title: 'Content',
        options: [
          'I will provide texts & images', 'Content writing needed', 'Translation (AR ↔ EN)',
          'Professional photo shoot', 'Licensed stock images', 'Promo video / intro animation'
        ]
      },
      {
        id: 'marketing',
        title: 'Marketing & SEO',
        options: [
          'SEO optimization', 'Google Analytics', 'Google Business profile',
          'Facebook / Instagram pixel', 'Social media share previews', 'Email marketing integration',
          'Sitemap & Search Console'
        ]
      },
      {
        id: 'security',
        title: 'Security & performance',
        options: [
          'SSL certificate (HTTPS)', 'Speed optimization', 'Spam / bot protection', 'Regular backups',
          'Privacy-law compliance', 'Uptime monitoring'
        ]
      },
      {
        id: 'launch',
        title: 'Launch & support',
        options: [
          'Domain registration', 'Hosting setup', 'Business email accounts',
          'Training on managing the site', 'Free support period (30 days)', 'Monthly maintenance',
          'Full source code delivery', 'Written user guide'
        ]
      }
    ]
  },

  mobile: {
    id: 'mobile',
    label: 'Mobile app',
    title: 'Mobile App Project Requirements',
    sections: [
      {
        id: 'platform',
        title: 'Platform',
        options: ['Android', 'iPhone (iOS)', 'Both (one codebase)', 'Tablet support', 'Smart-watch companion']
      },
      {
        id: 'appType',
        title: 'App type',
        options: [
          'Online store', 'Delivery & orders', 'Booking & appointments', 'Social / community',
          'Education & courses', 'Fitness & health', 'Internal business app', 'Real estate',
          'Ride / transport', 'News / content', 'Finance / wallet'
        ]
      },
      {
        id: 'accounts',
        title: 'Onboarding & accounts',
        options: [
          'Splash screen & intro slides', 'Sign up with email', 'Sign up with phone (OTP)',
          'Login with Google', 'Login with Apple', 'Login with Facebook',
          'Biometric login (fingerprint / face)', 'User profile page', 'Forgot / reset password',
          'Guest mode', 'Delete-account option'
        ]
      },
      {
        id: 'features',
        title: 'Core features',
        options: [
          'Search & filters', 'Favorites', 'Ratings & reviews', 'Camera & photo upload',
          'QR / barcode scanner', 'Works offline', 'Share to social media',
          'Multiple saved addresses', 'Home screen with banners', 'Referral / invite friends'
        ]
      },
      {
        id: 'communication',
        title: 'Communication & notifications',
        options: [
          'Push notifications', 'In-app chat', 'Voice / video calls', 'Email / SMS alerts',
          'In-app support tickets', 'WhatsApp contact button'
        ]
      },
      {
        id: 'location',
        title: 'Maps & location',
        options: [
          'Maps & nearest branch', 'Live location tracking', 'Route / directions',
          'Geofencing alerts', 'Delivery area selection'
        ]
      },
      {
        id: 'payments',
        title: 'Payments & orders',
        options: [
          'Card payment', 'Mobile wallet payment', 'Cash on delivery', 'Apple Pay / Google Pay',
          'Order tracking', 'Coupons & promo codes', 'Subscriptions / in-app purchases',
          'Invoices & receipts', 'Wallet / loyalty points'
        ]
      },
      {
        id: 'admin',
        title: 'Admin & backend',
        options: [
          'Web admin dashboard', 'Content management', 'User management', 'Reports & analytics',
          'Backend server & API', 'Database & cloud hosting', 'Roles & permissions',
          'Send notifications from dashboard', 'Export data to Excel'
        ]
      },
      {
        id: 'extraApps',
        title: 'Extra apps (if needed)',
        options: ['Driver / delivery app', 'Vendor / store app', 'Staff / employee app', 'Companion website']
      },
      {
        id: 'design',
        title: 'Design',
        options: [
          'Full UI/UX design', 'Use my brand identity', 'App icon design', 'Animated splash screen',
          'Custom illustrations', 'Arabic & English (RTL support)', 'Dark mode', 'Prototype to review first'
        ]
      },
      {
        id: 'security',
        title: 'Security & quality',
        options: [
          'Data encryption', 'Secure API & tokens', 'Testing & bug fixing', 'Performance optimization',
          'Crash reporting', 'Privacy policy & terms'
        ]
      },
      {
        id: 'launch',
        title: 'Launch & support',
        options: [
          'Publish on Google Play', 'Publish on App Store', 'Developer account setup help',
          'Store listing (screenshots & text)', 'Free support period (30 days)',
          'Updates & maintenance', 'Training for my team', 'Full source code delivery'
        ]
      }
    ]
  },

  desktop: {
    id: 'desktop',
    label: 'Desktop app',
    title: 'Desktop App Project Requirements',
    sections: [
      {
        id: 'os',
        title: 'Operating system',
        options: ['Windows', 'macOS', 'Linux', 'All systems', 'Old PCs (Windows 32-bit)']
      },
      {
        id: 'appType',
        title: 'Type of application',
        options: [
          'Inventory & warehouse', 'Point of sale (POS)', 'Accounting & invoices', 'HR & payroll',
          'Customer management (CRM)', 'Clinic / pharmacy', 'School management',
          'Restaurant management', 'Real-estate management', 'Reporting tool', 'Production / factory'
        ]
      },
      {
        id: 'users',
        title: 'Users & security',
        options: [
          'Login screen', 'User roles & permissions', 'Multiple users', 'Activity log',
          'Data encryption', 'Password rules', 'Auto logout when idle', 'Fingerprint / card login'
        ]
      },
      {
        id: 'records',
        title: 'Records & data entry',
        options: [
          'Add, edit, delete records', 'Search & filters', 'Sorting & grouping', 'Attach files / images',
          'Data validation', 'Undo / change history', 'Bulk edit'
        ]
      },
      {
        id: 'finance',
        title: 'Sales & finance',
        options: [
          'Invoices & receipts', 'Quotations / offers', 'Purchases & suppliers',
          'Customer accounts & debts', 'Expenses & revenue', 'Taxes (VAT)', 'Multiple currencies',
          'Discounts & returns', 'Electronic invoice (e-Invoice)'
        ]
      },
      {
        id: 'reports',
        title: 'Reports & output',
        options: [
          'Dashboard with key numbers', 'PDF reports', 'Charts & statistics', 'Print layouts',
          'Export to Excel / CSV', 'Import from Excel / CSV', 'Scheduled reports by email'
        ]
      },
      {
        id: 'hardware',
        title: 'Hardware',
        options: [
          'Barcode scanner', 'Receipt printer', 'Label printer', 'Cash drawer', 'Weighing scale',
          'Fingerprint device', 'Customer display'
        ]
      },
      {
        id: 'data',
        title: 'Data & connectivity',
        options: [
          'Local database (works offline)', 'Cloud sync', 'Multiple branches', 'Several PCs on one network',
          'Connect to a web API', 'Send email / SMS / WhatsApp', 'Integration with other systems',
          'Mobile companion app'
        ]
      },
      {
        id: 'backup',
        title: 'Backup & reliability',
        options: ['Automatic backup', 'Restore from backup', 'Backup to cloud / USB', 'Error logging', 'Auto-update']
      },
      {
        id: 'interface',
        title: 'Interface & languages',
        options: [
          'Arabic interface (right-to-left)', 'English interface', 'Dark mode', 'Keyboard shortcuts',
          'Touch-screen friendly', 'Custom interface design', 'Use my brand colors',
          'Notifications & reminders'
        ]
      },
      {
        id: 'delivery',
        title: 'Delivery & support',
        options: [
          'Installer / setup wizard', 'Installation on my computers', 'Move data from old system',
          'User training session', 'Written user manual', 'Free updates period',
          'Free support period (30 days)', 'Monthly support & maintenance', 'Full source code delivery'
        ]
      }
    ]
  }
};

export const REQUIREMENT_TYPES = Object.keys(REQUIREMENT_FORMS);

export const requirementFormFor = (type) => REQUIREMENT_FORMS[type] || null;

export const formTally = (form, answers = {}) => {
  if (!form) return { sections: 0, options: 0, chosen: 0 };
  const options = form.sections.reduce((total, section) => total + section.options.length, 0);
  const chosen = form.sections.reduce((total, section) => total + (answers[section.id]?.length || 0), 0);
  return { sections: form.sections.length, options, chosen };
};
