-- Seed data: 8 well-known papers (real titles, authors, venues, DOIs/arXiv IDs).
-- Abstracts and chunk texts are short summaries written for this project, not copies of the originals.
-- Papers start as PENDING; `npm run seed` (or `npm run embed`) embeds the chunks and marks them COMPLETED.
-- Idempotent: safe to run repeatedly. The password hashes are non-functional placeholders.
BEGIN;

INSERT INTO users (email, password_hash, full_name) VALUES
    ('admin@researchiq.local',      '$2b$12$' || repeat('A', 53), 'Demo Admin'),
    ('researcher@researchiq.local', '$2b$12$' || repeat('B', 53), 'Demo Researcher')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON
    (u.email = 'admin@researchiq.local' AND r.name = 'ADMIN') OR
    (u.email = 'researcher@researchiq.local' AND r.name = 'RESEARCHER')
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, description) VALUES
    ('Natural Language Processing', 'Language understanding and generation'),
    ('Information Retrieval',       'Search, ranking and retrieval-augmented systems'),
    ('Deep Learning',               'Neural network architectures and training'),
    ('Computer Vision',             'Image and video understanding'),
    ('Optimization',                'Training and optimisation methods'),
    ('Representation Learning',     'Learned embeddings and features')
ON CONFLICT (name) DO NOTHING;

INSERT INTO papers (title, abstract, publication_year, doi, venue, url) VALUES
 ('Attention Is All You Need',
  'Introduces the Transformer, a sequence model built entirely on attention instead of recurrence or convolution, and shows it trains faster and translates better.',
  2017, '10.48550/arxiv.1706.03762', 'NeurIPS', 'https://arxiv.org/abs/1706.03762'),
 ('BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
  'Pre-trains a bidirectional Transformer with masked language modelling and next-sentence prediction, then fine-tunes it to reach strong results across many language tasks.',
  2019, '10.48550/arxiv.1810.04805', 'NAACL', 'https://arxiv.org/abs/1810.04805'),
 ('Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
  'Combines a parametric language model with a non-parametric document index so generation can be conditioned on retrieved passages.',
  2020, '10.48550/arxiv.2005.11401', 'NeurIPS', 'https://arxiv.org/abs/2005.11401'),
 ('Dense Passage Retrieval for Open-Domain Question Answering',
  'Shows that a dual-encoder trained on question-passage pairs retrieves relevant passages better than sparse keyword methods for open-domain question answering.',
  2020, '10.48550/arxiv.2004.04906', 'EMNLP', 'https://arxiv.org/abs/2004.04906'),
 ('Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks',
  'Adapts BERT with siamese networks to produce sentence embeddings that can be compared with cosine similarity, making semantic search over many sentences practical.',
  2019, '10.48550/arxiv.1908.10084', 'EMNLP', 'https://arxiv.org/abs/1908.10084'),
 ('Deep Residual Learning for Image Recognition',
  'Uses residual connections so very deep networks can be trained, improving image classification accuracy.',
  2016, '10.1109/cvpr.2016.90', 'CVPR', 'https://arxiv.org/abs/1512.03385'),
 ('Adam: A Method for Stochastic Optimization',
  'Proposes an optimiser that adapts per-parameter learning rates from running estimates of gradient moments.',
  2015, '10.48550/arxiv.1412.6980', 'ICLR', 'https://arxiv.org/abs/1412.6980'),
 ('Efficient Estimation of Word Representations in Vector Space',
  'Presents fast architectures for learning word vectors from large corpora that capture syntactic and semantic regularities.',
  2013, '10.48550/arxiv.1301.3781', 'ICLR', 'https://arxiv.org/abs/1301.3781')
ON CONFLICT (doi) DO NOTHING;

-- Authors in publication order.
INSERT INTO authors (full_name)
SELECT DISTINCT n FROM unnest(ARRAY[
 'Ashish Vaswani','Noam Shazeer','Niki Parmar','Jakob Uszkoreit','Llion Jones','Aidan N. Gomez','Lukasz Kaiser','Illia Polosukhin',
 'Jacob Devlin','Ming-Wei Chang','Kenton Lee','Kristina Toutanova',
 'Patrick Lewis','Ethan Perez','Aleksandra Piktus','Fabio Petroni','Vladimir Karpukhin','Naman Goyal','Heinrich Küttler','Mike Lewis','Wen-tau Yih','Tim Rocktäschel','Sebastian Riedel','Douwe Kiela',
 'Barlas Oğuz','Sewon Min','Ledell Wu','Sergey Edunov','Danqi Chen',
 'Nils Reimers','Iryna Gurevych',
 'Kaiming He','Xiangyu Zhang','Shaoqing Ren','Jian Sun',
 'Diederik P. Kingma','Jimmy Ba',
 'Tomas Mikolov','Kai Chen','Greg Corrado','Jeffrey Dean']) AS n
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO paper_authors (paper_id, author_id, author_order)
SELECT p.id, a.id, v.ord
FROM (VALUES
 ('10.48550/arxiv.1706.03762','Ashish Vaswani',1),('10.48550/arxiv.1706.03762','Noam Shazeer',2),('10.48550/arxiv.1706.03762','Niki Parmar',3),
 ('10.48550/arxiv.1706.03762','Jakob Uszkoreit',4),('10.48550/arxiv.1706.03762','Llion Jones',5),('10.48550/arxiv.1706.03762','Aidan N. Gomez',6),
 ('10.48550/arxiv.1706.03762','Lukasz Kaiser',7),('10.48550/arxiv.1706.03762','Illia Polosukhin',8),
 ('10.48550/arxiv.1810.04805','Jacob Devlin',1),('10.48550/arxiv.1810.04805','Ming-Wei Chang',2),('10.48550/arxiv.1810.04805','Kenton Lee',3),('10.48550/arxiv.1810.04805','Kristina Toutanova',4),
 ('10.48550/arxiv.2005.11401','Patrick Lewis',1),('10.48550/arxiv.2005.11401','Ethan Perez',2),('10.48550/arxiv.2005.11401','Aleksandra Piktus',3),
 ('10.48550/arxiv.2005.11401','Fabio Petroni',4),('10.48550/arxiv.2005.11401','Vladimir Karpukhin',5),('10.48550/arxiv.2005.11401','Naman Goyal',6),
 ('10.48550/arxiv.2005.11401','Heinrich Küttler',7),('10.48550/arxiv.2005.11401','Mike Lewis',8),('10.48550/arxiv.2005.11401','Wen-tau Yih',9),
 ('10.48550/arxiv.2005.11401','Tim Rocktäschel',10),('10.48550/arxiv.2005.11401','Sebastian Riedel',11),('10.48550/arxiv.2005.11401','Douwe Kiela',12),
 ('10.48550/arxiv.2004.04906','Vladimir Karpukhin',1),('10.48550/arxiv.2004.04906','Barlas Oğuz',2),('10.48550/arxiv.2004.04906','Sewon Min',3),
 ('10.48550/arxiv.2004.04906','Patrick Lewis',4),('10.48550/arxiv.2004.04906','Ledell Wu',5),('10.48550/arxiv.2004.04906','Sergey Edunov',6),
 ('10.48550/arxiv.2004.04906','Danqi Chen',7),('10.48550/arxiv.2004.04906','Wen-tau Yih',8),
 ('10.48550/arxiv.1908.10084','Nils Reimers',1),('10.48550/arxiv.1908.10084','Iryna Gurevych',2),
 ('10.1109/cvpr.2016.90','Kaiming He',1),('10.1109/cvpr.2016.90','Xiangyu Zhang',2),('10.1109/cvpr.2016.90','Shaoqing Ren',3),('10.1109/cvpr.2016.90','Jian Sun',4),
 ('10.48550/arxiv.1412.6980','Diederik P. Kingma',1),('10.48550/arxiv.1412.6980','Jimmy Ba',2),
 ('10.48550/arxiv.1301.3781','Tomas Mikolov',1),('10.48550/arxiv.1301.3781','Kai Chen',2),('10.48550/arxiv.1301.3781','Greg Corrado',3),('10.48550/arxiv.1301.3781','Jeffrey Dean',4)
) AS v(doi, author, ord)
JOIN papers p ON p.doi = v.doi
JOIN authors a ON a.normalized_name = lower(v.author)
ON CONFLICT DO NOTHING;

INSERT INTO paper_categories (paper_id, category_id)
SELECT p.id, c.id
FROM (VALUES
 ('10.48550/arxiv.1706.03762','Natural Language Processing'),('10.48550/arxiv.1706.03762','Deep Learning'),
 ('10.48550/arxiv.1810.04805','Natural Language Processing'),('10.48550/arxiv.1810.04805','Representation Learning'),
 ('10.48550/arxiv.2005.11401','Natural Language Processing'),('10.48550/arxiv.2005.11401','Information Retrieval'),
 ('10.48550/arxiv.2004.04906','Information Retrieval'),('10.48550/arxiv.2004.04906','Natural Language Processing'),
 ('10.48550/arxiv.1908.10084','Representation Learning'),('10.48550/arxiv.1908.10084','Information Retrieval'),
 ('10.1109/cvpr.2016.90','Computer Vision'),('10.1109/cvpr.2016.90','Deep Learning'),
 ('10.48550/arxiv.1412.6980','Optimization'),('10.48550/arxiv.1412.6980','Deep Learning'),
 ('10.48550/arxiv.1301.3781','Representation Learning'),('10.48550/arxiv.1301.3781','Natural Language Processing')
) AS v(doi, category)
JOIN papers p ON p.doi = v.doi JOIN categories c ON c.name = v.category
ON CONFLICT DO NOTHING;

-- Chunks: short project-written summaries standing in for extracted text (page/section are illustrative seed values).
INSERT INTO paper_chunks (paper_id, chunk_index, section, page_number, content, token_count, content_hash)
SELECT p.id, v.idx, v.section, v.page, v.content, ceil(length(v.content) / 4.0)::int,
       encode(sha256(convert_to(v.content, 'UTF8')), 'hex')
FROM (VALUES
 ('10.48550/arxiv.1706.03762',0,'Model Architecture',3,'The Transformer stacks encoder and decoder layers that rely on multi-head self-attention and position-wise feed-forward networks, removing recurrence so all positions are processed in parallel.'),
 ('10.48550/arxiv.1706.03762',1,'Results',8,'On machine translation benchmarks the attention-only model reached higher translation quality than earlier recurrent and convolutional systems while needing much less training time.'),
 ('10.48550/arxiv.1810.04805',0,'Pre-training',4,'The model is pre-trained on unlabeled text by predicting randomly masked tokens using context from both directions, and by predicting whether one sentence follows another.'),
 ('10.48550/arxiv.1810.04805',1,'Fine-tuning',6,'After pre-training, one added output layer and end-to-end fine-tuning adapt the same network to question answering, classification and tagging tasks.'),
 ('10.48550/arxiv.2005.11401',0,'Approach',3,'A retriever fetches relevant passages from a dense index and a sequence-to-sequence generator conditions on them, so answers can use knowledge stored outside the model weights.'),
 ('10.48550/arxiv.2005.11401',1,'Discussion',9,'Grounding generation in retrieved documents makes answers easier to inspect and update, because the supporting passages can be shown and the index can be refreshed without retraining.'),
 ('10.48550/arxiv.2004.04906',0,'Method',3,'Questions and passages are encoded by two separate neural encoders, and retrieval selects the passages whose vectors have the highest inner product with the question vector.'),
 ('10.48550/arxiv.2004.04906',1,'Experiments',6,'The learned dense retriever outperformed a BM25 keyword baseline on top-20 passage accuracy across several open-domain question answering datasets.'),
 ('10.48550/arxiv.1908.10084',0,'Approach',3,'A siamese network applies the same BERT encoder to two sentences and pools the outputs into fixed-size vectors that can be compared directly with cosine similarity.'),
 ('10.48550/arxiv.1908.10084',1,'Introduction',1,'Comparing sentences by feeding every pair through BERT is far too slow for large collections, whereas precomputed sentence vectors make semantic search fast.'),
 ('10.1109/cvpr.2016.90',0,'Residual Learning',3,'Layers learn a residual function added to their input through a shortcut connection, which eases optimisation and allows networks with over a hundred layers to be trained.'),
 ('10.1109/cvpr.2016.90',1,'Experiments',6,'Deeper residual networks achieved lower error on large-scale image classification, whereas plain networks of similar depth became harder to train.'),
 ('10.48550/arxiv.1412.6980',0,'Algorithm',2,'The optimiser keeps exponential moving averages of the gradient and its square, corrects their initialisation bias, and scales each parameter update accordingly.'),
 ('10.48550/arxiv.1412.6980',1,'Experiments',6,'Across logistic regression, neural networks and convolutional models the method converged quickly and needed little hyper-parameter tuning.'),
 ('10.48550/arxiv.1301.3781',0,'Model Architectures',3,'Two log-linear architectures predict a word from its surrounding context or the surrounding context from a word, learning dense word vectors cheaply from very large corpora.'),
 ('10.48550/arxiv.1301.3781',1,'Results',7,'The learned vectors capture analogies, for example the offset between related word pairs is consistent, which can be tested with simple vector arithmetic.')
) AS v(doi, idx, section, page, content)
JOIN papers p ON p.doi = v.doi
ON CONFLICT (paper_id, chunk_index) DO NOTHING;

-- Demo activity so the analytics queries have data.
INSERT INTO saved_papers (user_id, paper_id)
SELECT u.id, p.id FROM users u CROSS JOIN papers p
WHERE u.email = 'researcher@researchiq.local' AND p.doi IN ('10.48550/arxiv.2005.11401','10.48550/arxiv.2004.04906','10.48550/arxiv.1706.03762')
ON CONFLICT DO NOTHING;

INSERT INTO search_queries (id, user_id, query_text, search_type, filters, result_count, created_at)
SELECT v.id::uuid, u.id, v.q, v.t, '{}'::jsonb, v.n, now() - v.age
FROM (VALUES
 ('11111111-1111-1111-1111-000000000001','retrieval augmented generation','KEYWORD',2,interval '6 days'),
 ('11111111-1111-1111-1111-000000000002','how do dense retrievers beat keyword search','SEMANTIC',2,interval '4 days'),
 ('11111111-1111-1111-1111-000000000003','retrieval augmented generation','KEYWORD',2,interval '2 days'),
 ('11111111-1111-1111-1111-000000000004','sentence embeddings cosine similarity','SEMANTIC',1,interval '1 day')
) AS v(id, q, t, n, age)
CROSS JOIN (SELECT id FROM users WHERE email = 'researcher@researchiq.local') u
ON CONFLICT (id) DO NOTHING;

INSERT INTO search_results (search_query_id, paper_id, chunk_id, rank, score)
SELECT v.sq::uuid, p.id, c.id, v.rank, v.score
FROM (VALUES
 ('11111111-1111-1111-1111-000000000001','10.48550/arxiv.2005.11401',NULL,1,0.61),
 ('11111111-1111-1111-1111-000000000001','10.48550/arxiv.2004.04906',NULL,2,0.20),
 ('11111111-1111-1111-1111-000000000002','10.48550/arxiv.2004.04906',1,1,0.58),
 ('11111111-1111-1111-1111-000000000002','10.48550/arxiv.2005.11401',0,2,0.41),
 ('11111111-1111-1111-1111-000000000003','10.48550/arxiv.2005.11401',NULL,1,0.61),
 ('11111111-1111-1111-1111-000000000003','10.48550/arxiv.2004.04906',NULL,2,0.20),
 ('11111111-1111-1111-1111-000000000004','10.48550/arxiv.1908.10084',0,1,0.66)
) AS v(sq, doi, chunk_idx, rank, score)
JOIN papers p ON p.doi = v.doi
LEFT JOIN paper_chunks c ON c.paper_id = p.id AND c.chunk_index = v.chunk_idx
ON CONFLICT (search_query_id, rank) DO NOTHING;

COMMIT;
